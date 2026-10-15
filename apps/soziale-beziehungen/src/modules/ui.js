/*!
 * ui.js – Form-/Tastatur-Logik & Add/Remove/Reset
 * (c) 2026 Stefan Pätz, Inhalt & Form Beratungsgesellschaft mbH (LöWe – Lösungsorientierte Weiterbildung)
 * Nutzung: loewe-weiterbildung.de
 * Idee dieser Datei: Alle DOM-Events der UI bündeln und passende Aktionen auslösen.
 */

import {
  state,
  nameExistsInPersons,
  nameExistsInAspects,
  assignColors,
  updateModel,
  randomBaseColor,
  NAME_LIBRARY,
  ASPECT_LIBRARY
} from './state.js';

import { startNewTick, renderTimeWidget, restoreTimeline} from './simulation.js';
import { render, getActions } from './render.js';
import { uiState } from './uiState.js';

let ctrlHeld = false;
// =========================
// Performance-UX: Burst-Coalescing + Cooldown ab Schwelle
// =========================
const HEAVY_NODE_THRESHOLD = 27;   // ab hier Eingaben drosseln
const COALESCE_MS = 250;           // Klick-Bursts bündeln
const COOLDOWN_MS = 1000;          // nach Flush kurz sperren

let inputLockUntil = 0;
let flushTimer = null;
let unlockTimer = null;

function scheduleUnlockRefresh(){
  if (unlockTimer) window.clearTimeout(unlockTimer);
  const remaining = inputLockUntil - nowMs();
  if (remaining <= 0) return;

  unlockTimer = window.setTimeout(() => {
    unlockTimer = null;
    refreshActionButton();
    refreshRandomButtons();
  }, remaining + 10); // +10ms Puffer
}
const pendingOps = {
  addRandomPerson: 0,
  addRandomAspect: 0,
  removeRandomPerson: 0,
  removeRandomAspect: 0,
};

// Helpers
function nowMs(){ return Date.now(); }
function totalNodeCount(){
  const p = Array.isArray(state.persons) ? state.persons.length : 0;
  const a = Array.isArray(state.aspects) ? state.aspects.length : 0;
  return p + a;
}
function isHeavy(){ return totalNodeCount() >= HEAVY_NODE_THRESHOLD; }
function isLocked(){ return isHeavy() && nowMs() < inputLockUntil; }
function setLockedFor(ms){
  inputLockUntil = Math.max(inputLockUntil, nowMs() + ms);
  scheduleUnlockRefresh();
}
function setBusyUI(isBusy){
  const btnAdd = document.getElementById('btn-random-add');
  const btnRem = document.getElementById('btn-random-remove');
  const actBtn = document.getElementById('act-btn');
  [btnAdd, btnRem, actBtn].forEach((b)=>{
    if (!b) return;
    b.classList.toggle('ui-busy', !!isBusy);
  });
}

function setPendingBadge(btn, count){
  if (!btn) return;
  const n = Number(count || 0);

  // Badge-Element sicherstellen
  let badge = btn.querySelector('.pending-badge');
  if (!badge){
    badge = document.createElement('span');
    badge.className = 'pending-badge';
    badge.setAttribute('aria-hidden', 'true');
    btn.appendChild(badge);
    btn.classList.add('has-pending-container');
  }

  if (n > 0){
    badge.textContent = String(n);
    badge.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}

function updatePendingBadges(){
    // Safety: pending caps einhalten, falls sich State zwischendurch geändert hat
  pendingOps.addRandomPerson = Math.min(getAvailablePersonEntries().length, pendingOps.addRandomPerson);
  pendingOps.addRandomAspect = Math.min(getAvailableAspectEntries().length, pendingOps.addRandomAspect);
  pendingOps.removeRandomPerson = Math.min((Array.isArray(state.persons) ? state.persons.length : 0), pendingOps.removeRandomPerson);
  pendingOps.removeRandomAspect = Math.min((Array.isArray(state.aspects) ? state.aspects.length : 0), pendingOps.removeRandomAspect);
  const btnAdd = document.getElementById('btn-random-add');
  const btnRem = document.getElementById('btn-random-remove');

  // Badges abhängig vom aktuellen Modus anzeigen (Person vs Aspekt)
  const addCount = ctrlHeld ? pendingOps.addRandomAspect : pendingOps.addRandomPerson;
  const remCount = ctrlHeld ? pendingOps.removeRandomAspect : pendingOps.removeRandomPerson;

  setPendingBadge(btnAdd, addCount);
  setPendingBadge(btnRem, remCount);
}

function scheduleFlushPending(){
  updatePendingBadges();
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(()=>{
    flushTimer = null;
    flushPendingOps();
  }, COALESCE_MS);
}

function getPendingAddCap(){
  return ctrlHeld ? getAvailableAspectEntries().length : getAvailablePersonEntries().length;
}

function getPendingRemoveCap(){
  return ctrlHeld
    ? (Array.isArray(state.aspects) ? state.aspects.length : 0)
    : (Array.isArray(state.persons) ? state.persons.length : 0);
}

function recomputeCtrlHeld(e){ if (e) ctrlHeld = !!e.ctrlKey; }

function computeAction(name){
  const trimmed = (name || '').trim();
  const existsP = !!trimmed && nameExistsInPersons(trimmed);
  const existsA = !!trimmed && nameExistsInAspects(trimmed);
  if (existsP) return { kind:'person', action:'remove' };
  if (existsA) return { kind:'aspect', action:'remove' };
  return { kind:(ctrlHeld ? 'aspect' : 'person'), action:'add' };
}

/* =========================
   Eingabe-Sanitizing / Limits
   =========================
   - UI-Constraint: maxlength="18" ist im HTML gesetzt.
   - Hier zusätzlich: nur erlaubte Zeichen.
   - Wichtig: Während des Tippens NICHT trimmen, sonst kann man kein Leerzeichen eingeben.
   - Final (beim Ausführen): Whitespace normalisieren + trim.
*/
const MAX_NAME_LEN = 18;
// erlaubt: Buchstaben (inkl. Umlaute/ß), Leerzeichen, Bindestrich, Apostroph
const NAME_ALLOWED_RE = /[^A-Za-zÄÖÜäöüß \-']/g;

/**
 * Für das Tippen: Leerzeichen zulassen (kein live-trim).
 * - entfernt Steuerzeichen
 * - entfernt nicht erlaubte Zeichen
 * - mehrere Spaces werden auf 1 reduziert (ohne trim)
 * - harte Länge
 */
function sanitizeNameTyping(raw){
  let s = String(raw ?? '');

  // unsichtbare/steuerzeichen raus
  s = s.replace(/[\u0000-\u001F\u007F]/g, '');

  // nur erlaubte chars
  s = s.replace(NAME_ALLOWED_RE, '');

  // mehrere Whitespaces zu einem Space (ohne trim)
  s = s.replace(/\s{2,}/g, ' ');

  // max-länge hart
  if (s.length > MAX_NAME_LEN) s = s.slice(0, MAX_NAME_LEN);

  return s;
}

/**
 * Final (beim Ausführen): sauber trimmen + Whitespace normalisieren.
 */
function sanitizeNameFinal(raw){
  let s = sanitizeNameTyping(raw);
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > MAX_NAME_LEN) s = s.slice(0, MAX_NAME_LEN).trim();
  return s;
}

function lower(s){ return String(s ?? '').trim().toLowerCase(); }

function refreshActionButton(){
  const input = document.getElementById('person-input');
  const actBtn = document.getElementById('act-btn');
  if (!input || !actBtn) return;

  // ✅ Cooldown bei hoher Last: Button kurz sperren
  if (isLocked()){
    actBtn.disabled = true;
    actBtn.setAttribute('data-tip', 'Wird verarbeitet…');
    actBtn.classList.add('ui-busy');
    return;
  }
  actBtn.disabled = false;
  actBtn.classList.remove('ui-busy');

  const cleaned = sanitizeNameFinal(input.value);
  const { kind, action } = computeAction(cleaned);

  actBtn.className = 'btn btn-large';
  if (action === 'remove'){
    actBtn.textContent = (kind === 'person') ? 'Person entfernen' : 'Aspekt entfernen';
    actBtn.classList.add('btn-warning');
  } else if (kind === 'person'){
    actBtn.textContent = 'Person hinzufügen';
    actBtn.classList.add('btn-primary');
  } else {
    actBtn.textContent = 'Aspekt hinzufügen';
    actBtn.classList.add('btn-secondary');
  }

  actBtn.disabled = cleaned.length === 0;
}

function pickRandom(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

/* =========================
   Random + / - (Personen ODER Aspekte per STRG)
   ========================= */

function getAvailablePersonEntries(){
  const persons = Array.isArray(state.persons) ? state.persons : [];
  const used = new Set(persons.map(p => lower(p?.name)));

  const library = Array.isArray(NAME_LIBRARY) ? NAME_LIBRARY : [];
  return library.filter(entry => {
    const n = lower(entry?.name);
    return !!n && !used.has(n);
  });
}

function getAvailableAspectEntries(){
  const aspects = Array.isArray(state.aspects) ? state.aspects : [];
  const used = new Set(aspects.map(a => lower(a?.name)));

  const library = Array.isArray(ASPECT_LIBRARY) ? ASPECT_LIBRARY : [];
  return library.filter(entry => {
    const n = lower(entry?.name);
    return !!n && !used.has(n);
  });
}

function setRandomButtonsTooltipAndState(){
  const btnAdd = document.getElementById('btn-random-add');
  const btnRem = document.getElementById('btn-random-remove');
  if (!btnAdd || !btnRem) return;

  const isAspectMode = !!ctrlHeld;
  // ✅ Cooldown bei hoher Last: Random-Buttons kurz sperren
  if (isLocked()){
    btnAdd.disabled = true;
    btnRem.disabled = true;
    btnAdd.setAttribute('data-tip', 'Wird verarbeitet…');
    btnRem.setAttribute('data-tip', 'Wird verarbeitet…');
    btnAdd.classList.add('ui-busy');
    btnRem.classList.add('ui-busy');
    return;
  }
  btnAdd.classList.remove('ui-busy');
  btnRem.classList.remove('ui-busy');

  if (isAspectMode){
    // 🔁 STRG gedrückt → Aspekte
    btnAdd.setAttribute('data-tip', 'Zufälligen Aspekt hinzufügen');
    btnRem.setAttribute('data-tip', 'Zufälligen Aspekt entfernen');

    btnAdd.setAttribute('aria-label', 'Zufälligen Aspekt hinzufügen');
    btnRem.setAttribute('aria-label', 'Zufälligen Aspekt entfernen');
  } else {
    // 👤 Normal → Personen
    btnAdd.setAttribute('data-tip', 'Zufällige Person hinzufügen');
    btnRem.setAttribute('data-tip', 'Zufällige Person entfernen');

    btnAdd.setAttribute('aria-label', 'Zufällige Person hinzufügen');
    btnRem.setAttribute('aria-label', 'Zufällige Person entfernen');
  }

  // Disabled-Status je nach Modus
  if (isAspectMode){
    const available = getAvailableAspectEntries();
    const aspects = Array.isArray(state.aspects) ? state.aspects : [];
    btnAdd.disabled = available.length === 0;
    btnRem.disabled = aspects.length === 0;
  } else {
    const available = getAvailablePersonEntries();
    const persons = Array.isArray(state.persons) ? state.persons : [];
    btnAdd.disabled = available.length === 0;
    btnRem.disabled = persons.length === 0;
  }
}

function refreshRandomButtons(){
  // Backward-compat wrapper
  setRandomButtonsTooltipAndState();
  updatePendingBadges();
}

function flushPendingOps(){
  const total =
    pendingOps.addRandomPerson +
    pendingOps.addRandomAspect +
    pendingOps.removeRandomPerson +
    pendingOps.removeRandomAspect;
  if (total === 0) return;

  setBusyUI(true);
  updatePendingBadges();

  // Overlays vor Strukturänderungen schließen (wie bei actBtn)
  getActions()?.closeAllOverlays?.({ renderAfter: false });

  // 1) Entfernen zuerst
  if (pendingOps.removeRandomPerson > 0){
    const n = pendingOps.removeRandomPerson;
    pendingOps.removeRandomPerson = 0;

    for (let i=0; i<n; i++){
      const persons = Array.isArray(state.persons) ? state.persons : [];
      if (persons.length === 0) break;
      const victim = pickRandom(persons);
      state.persons = persons.filter(p => p !== victim);
      state.aspects.forEach(a => { if (a?.colorLinkMap) delete a.colorLinkMap?.[victim?.name]; });
    }
  }

  if (pendingOps.removeRandomAspect > 0){
    const n = pendingOps.removeRandomAspect;
    pendingOps.removeRandomAspect = 0;

    for (let i=0; i<n; i++){
      const aspects = Array.isArray(state.aspects) ? state.aspects : [];
      if (aspects.length === 0) break;
      const victim = pickRandom(aspects);
      state.aspects = aspects.filter(a => a !== victim);
    }
  }

  // 2) Hinzufügen
  if (pendingOps.addRandomPerson > 0){
    const n = pendingOps.addRandomPerson;
    pendingOps.addRandomPerson = 0;

    for (let i=0; i<n; i++){
      const available = getAvailablePersonEntries();
      if (available.length === 0) break;

      const randomEntry = pickRandom(available);
      const safeName = sanitizeNameFinal(randomEntry?.name);
      if (!safeName) continue;
      if (nameExistsInPersons(safeName) || nameExistsInAspects(safeName)) continue;

      state.persons.push({
        type: 'person',
        name: safeName,
        colorLinkMap: {},
        metaColor: randomBaseColor(),
        features: (randomEntry && typeof randomEntry.features === 'object') ? randomEntry.features : {}
      });
    }
  }

  if (pendingOps.addRandomAspect > 0){
    const n = pendingOps.addRandomAspect;
    pendingOps.addRandomAspect = 0;

    for (let i=0; i<n; i++){
      const availableA = getAvailableAspectEntries();
      if (availableA.length === 0) break;

      const randomEntryA = pickRandom(availableA);
      const safeNameA = String(randomEntryA?.name ?? '').trim().slice(0, MAX_NAME_LEN);
      if (!safeNameA) continue;
      if (nameExistsInAspects(safeNameA) || nameExistsInPersons(safeNameA)) continue;

      state.aspects.push({
        type: 'aspect',
        name: safeNameA,
        colorLinkMap: {},
        features: (randomEntryA && typeof randomEntryA.features === 'object') ? randomEntryA.features : {}
      });
    }
  }

  // Modell + Tick nur EINMAL
  assignColors();
  updateModel();
  startNewTick('ui-batched-random');
  renderTimeWidget();

  refreshActionButton();
  refreshRandomButtons();

  if (isHeavy()) setLockedFor(COOLDOWN_MS);
  refreshActionButton();
  refreshRandomButtons();
  // pendingOps sind jetzt auf 0 gesetzt -> Badges weg
  updatePendingBadges();
  setBusyUI(false);
}

export function initUI(){
  const input           = document.getElementById('person-input');
  const actBtn          = document.getElementById('act-btn');
  const btnReset        = document.getElementById('reset');
  const btnRandomAdd    = document.getElementById('btn-random-add');
  const btnRandomRemove = document.getElementById('btn-random-remove');

  if (!input || !actBtn || !btnReset) return;

  // Enter/STRG-Umschalter
  const maybeForm = input.closest('form');
  if (maybeForm) maybeForm.addEventListener('submit', (e)=>e.preventDefault());

  // Eingabe live säubern (ohne live-trim, damit Leerzeichen möglich bleiben)
  input.addEventListener('input', ()=>{
    const cleaned = sanitizeNameTyping(input.value);
    if (cleaned !== input.value) input.value = cleaned;

    refreshActionButton();
    refreshRandomButtons();
  });

  input.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter'){
      e.preventDefault();
      recomputeCtrlHeld(e);
      actBtn.click();
    }
  });

  window.addEventListener('keydown', (e)=>{
    // wichtig: auch wenn ctrlKey gesetzt ist (z.B. Mac/Browser), sauber aktualisieren
    if (e.key === 'Control' || e.ctrlKey){
      const was = ctrlHeld;
      ctrlHeld = true;
      if (!was){
        refreshActionButton();
        refreshRandomButtons();
      }
    }
  });

  window.addEventListener('keyup', (e)=>{
    // wenn Control losgelassen wurde ODER ctrlKey false ist
    if (e.key === 'Control' || !e.ctrlKey){
      const was = ctrlHeld;
      ctrlHeld = false;
      if (was){
        refreshActionButton();
        refreshRandomButtons();
      }
    }
  });

  window.addEventListener('blur', ()=>{
    const was = ctrlHeld;
    ctrlHeld = false;
    if (was){
      refreshActionButton();
      refreshRandomButtons();
    }
  });

  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState !== 'visible'){
      const was = ctrlHeld;
      ctrlHeld = false;
      if (was){
        refreshActionButton();
        refreshRandomButtons();
      }
    }
  });

  // Initial UI state
  refreshActionButton();
  refreshRandomButtons();

  // Klick-Logik Add/Remove (Input)
  actBtn.addEventListener('click', ()=>{
    // ✅ Cooldown bei hoher Last: wiederholte Klicks abfangen
    if (isLocked()) return;
    // immer final sanitizen (nicht dem DOM-Attribut vertrauen)
    const name = sanitizeNameFinal(input.value);
    if (!name) return;
    // ✅ Overlays vor Strukturänderungen schließen (Sticky-Line/Bubble/Menu/Tooltip)
    getActions()?.closeAllOverlays?.({ renderAfter: false });
    const existsP = nameExistsInPersons(name);
    const existsA = nameExistsInAspects(name);

    if (existsP){
      // Person entfernen
      state.persons = state.persons.filter(p => lower(p.name) !== lower(name));
      state.aspects.forEach(a => { if (a.colorLinkMap) delete a.colorLinkMap[name]; });

      getActions()?.resetUiView?.({ renderAfter: false });

      input.value = '';
      state.view.g.selectAll('.meta').remove();
      state.view.g.selectAll('.arrow').remove();

      assignColors();
      updateModel();
      startNewTick('remove');
      renderTimeWidget();
      if (isHeavy()) setLockedFor(COOLDOWN_MS);

      refreshActionButton();
      refreshRandomButtons();
      return;
    }

    if (existsA){
      // Aspekt entfernen
      state.aspects = state.aspects.filter(a => lower(a.name) !== lower(name));
      state.persons.forEach(p => { if (p.colorLinkMap) delete p.colorLinkMap[name]; });

      input.value = '';

      assignColors();
      updateModel();
      startNewTick('remove');
      renderTimeWidget();
      if (isHeavy()) setLockedFor(COOLDOWN_MS);

      refreshActionButton();
      refreshRandomButtons();
      return;
    }

    // Neu anlegen
    const addKind = ctrlHeld ? 'aspect' : 'person';

    if (addKind === 'person'){
      state.persons.push({
        type:'person',
        name,
        colorLinkMap:{},
        metaColor: randomBaseColor()
      });
    } else {
      state.aspects.push({
        type:'aspect',
        name,
        colorLinkMap:{}
      });
    }

    input.value = '';

    assignColors();
    updateModel();
    startNewTick('add');
    renderTimeWidget();
    if (isHeavy()) setLockedFor(COOLDOWN_MS);

    setTimeout(()=>{
      input.focus();
      refreshActionButton();
      refreshRandomButtons();
    }, 0);
  });

  /* =========================
     Random + / - (Personen/Aspekte)
     ========================= */

  // + Zufällig hinzufügen (Person ohne STRG, Aspekt mit STRG)
  if (btnRandomAdd){
    btnRandomAdd.addEventListener('click', ()=>{
      refreshRandomButtons();
      if (btnRandomAdd.disabled) return;
      // ✅ Cooldown: ignorieren
      if (isLocked()) return;

      // ✅ Heavy Mode: Klicks bündeln
      if (isHeavy()){
        const cap = getPendingAddCap();

        if (!ctrlHeld){
          pendingOps.addRandomPerson = Math.min(cap, pendingOps.addRandomPerson + 1);
        } else {
          pendingOps.addRandomAspect = Math.min(cap, pendingOps.addRandomAspect + 1);
        }

        updatePendingBadges();
        scheduleFlushPending();
        refreshRandomButtons();
        return;
      }

      const isAspectMode = !!ctrlHeld;

      if (!isAspectMode){
        // ---- PERSON hinzufügen ----
        const available = getAvailablePersonEntries();
        if (available.length === 0){
          refreshRandomButtons();
          return;
        }

        const randomEntry = pickRandom(available);
        const safeName = sanitizeNameFinal(randomEntry?.name);
        if (!safeName){
          refreshRandomButtons();
          return;
        }

        // doppelt absichern
        if (nameExistsInPersons(safeName) || nameExistsInAspects(safeName)){
          refreshRandomButtons();
          return;
        }

        state.persons.push({
          type: 'person',
          name: safeName,
          colorLinkMap: {},
          metaColor: randomBaseColor(),
          features: (randomEntry && typeof randomEntry.features === 'object') ? randomEntry.features : {}
        });

        assignColors();
        updateModel();
        startNewTick('add-random-person');
        renderTimeWidget();

        refreshActionButton();
        refreshRandomButtons();
        return;
      }

      // ---- ASPEKT hinzufügen ----
      const availableA = getAvailableAspectEntries();
      if (availableA.length === 0){
        refreshRandomButtons();
        return;
      }

      const randomEntryA = pickRandom(availableA);
      // Aspekte: nicht so aggressiv sanitizen wie Personen – aber wir halten Länge/Trim ein
      const safeNameA = String(randomEntryA?.name ?? '').trim().slice(0, MAX_NAME_LEN);
      if (!safeNameA){
        refreshRandomButtons();
        return;
      }

      // doppelt absichern
      if (nameExistsInAspects(safeNameA) || nameExistsInPersons(safeNameA)){
        refreshRandomButtons();
        return;
      }

      state.aspects.push({
        type: 'aspect',
        name: safeNameA,
        colorLinkMap: {},
        features: (randomEntryA && typeof randomEntryA.features === 'object') ? randomEntryA.features : {}
      });

      assignColors();
      updateModel();
      startNewTick('add-random-aspect');
      renderTimeWidget();

      refreshActionButton();
      refreshRandomButtons();
    });
  }

  // − Zufällig entfernen (Person ohne STRG, Aspekt mit STRG)
  if (btnRandomRemove){
    btnRandomRemove.addEventListener('click', ()=>{
      refreshRandomButtons();
      if (btnRandomRemove.disabled) return;
      // ✅ Cooldown: ignorieren
      if (isLocked()) return;

      // ✅ Heavy Mode: Klicks bündeln
      if (isHeavy()){
        const cap = getPendingRemoveCap();

        if (!ctrlHeld){
          pendingOps.removeRandomPerson = Math.min(cap, pendingOps.removeRandomPerson + 1);
        } else {
          pendingOps.removeRandomAspect = Math.min(cap, pendingOps.removeRandomAspect + 1);
        }

        updatePendingBadges();
        scheduleFlushPending();
        refreshRandomButtons();
        return;
      }

      const isAspectMode = !!ctrlHeld;

      if (!isAspectMode){
        // ---- PERSON entfernen ----
        const persons = Array.isArray(state.persons) ? state.persons : [];
        if (persons.length === 0){
          refreshRandomButtons();
          return;
        }

        const idx = Math.floor(Math.random() * persons.length);
        const removed = persons[idx];
        const removedName = removed?.name;

        persons.splice(idx, 1);
        state.persons = persons;

        // Color maps aufräumen
        if (removedName){
          state.aspects.forEach(a => {
            if (a.colorLinkMap) delete a.colorLinkMap[removedName];
          });
        }

        getActions()?.resetUiView?.({ renderAfter: false });

        assignColors();
        updateModel();
        startNewTick('remove-random-person');
        renderTimeWidget();

        refreshActionButton();
        refreshRandomButtons();
        return;
      }

      // ---- ASPEKT entfernen ----
      const aspects = Array.isArray(state.aspects) ? state.aspects : [];
      if (aspects.length === 0){
        refreshRandomButtons();
        return;
      }

      const idxA = Math.floor(Math.random() * aspects.length);
      const removedA = aspects[idxA];
      const removedNameA = removedA?.name;

      aspects.splice(idxA, 1);
      state.aspects = aspects;

      // Color maps aufräumen
      if (removedNameA){
        state.persons.forEach(p => {
          if (p.colorLinkMap) delete p.colorLinkMap[removedNameA];
        });
      }

      // UI-State (wie bei Person-Entfernung)
      getActions()?.resetUiView?.({ renderAfter: false });

      assignColors();
      updateModel();
      startNewTick('remove-random-aspect');
      renderTimeWidget();

      refreshActionButton();
      refreshRandomButtons();
    });
  }

  // Reset
  btnReset.addEventListener('click', ()=>{
    getActions()?.closeAllOverlays?.({ renderAfter: false });
    state.persons = [];
    state.aspects = [];
    state.links = [];

    getActions()?.resetUiView?.({ renderAfter: false });

    sessionStorage.removeItem('persons');
    sessionStorage.removeItem('aspects');

    state.view.g.selectAll('*').remove();

    localStorage.removeItem('timeline');

    state.currentDayIndex = 0;
    state.currentHour = 7;
    state.currentMinute = 0;

    restoreTimeline();
    renderTimeWidget();
    refreshActionButton();
    refreshRandomButtons();
    render();
  });
}
