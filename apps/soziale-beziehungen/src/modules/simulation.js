/*!
 * simulation.js – Zeitlogik, Snapshots & Timeline-Persistenz
 * (c) 2026 Stefan Pätz, Inhalt & Form Beratungsgesellschaft mbH (LöWe – Lösungsorientierte Weiterbildung)
 * Nutzung: loewe-weiterbildung.de
 * Idee dieser Datei: Tick-basierte Zeit, Views einfrieren, (de)persistieren.
 */

import {
  state, getAllNodes, isPerson, adjectivesPoolFor, pickWeightedRelationForPair,
  assignColors, updateModel
} from './state.js';
import { render, getActions } from './render.js';

export function advanceTime() {
  const hourJump = 2 + Math.floor(Math.random() * 7); // 2–8h
  const quarterJump = Math.floor(Math.random() * 4) * 15; // 0/15/30/45
  let nextHour = state.currentHour + hourJump;
  let nextMinute = quarterJump;

  if (nextHour >= 19) {
    state.currentDayIndex = (state.currentDayIndex + 1) % state.WEEKDAYS.length;
    state.currentHour = 7 + (nextHour - 19);
    state.currentMinute = nextMinute;
  } else {
    state.currentHour = nextHour;
    state.currentMinute = nextMinute;
  }
  renderTimeWidget();
}

export function renderTimeWidget() {
  // ✅ Werktage-only (Mo–Fr): Index immer auf 0..4 abbilden
  const tagShorts = ['Mo','Di','Mi','Do','Fr'];

  // robust: falls state.WEEKDAYS mehr als 5 Tage enthält (oder undefiniert ist)
  const weekdayNames = Array.isArray(state.WEEKDAYS) && state.WEEKDAYS.length
    ? state.WEEKDAYS.slice(0, 5)
    : ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag'];

  const dayIndex = ((state.currentDayIndex % 5) + 5) % 5;
  const day = weekdayNames[dayIndex];

  const minStr = String(state.currentMinute).padStart(2, '0');
  const timeStr = `${state.currentHour}:${minStr}`;

  let tageHTML = `<div class="zeit-tage">`;
  tagShorts.forEach((t,i)=>{ tageHTML += `<div class="zeit-tag${i===dayIndex?' active':''}">${t}</div>`; });
  tageHTML += `</div>`;

  const winkelH = ((state.currentHour % 12) + state.currentMinute / 60) * 30;
  const winkelM = state.currentMinute * 6;
  const r = 28;

  const uhrSVG = `
    <svg width="62" height="62" class="zeit-analog">
      <circle cx="31" cy="31" r="${r}" fill="#f9f9f9" stroke="#bbb" stroke-width="2"/>
      <line x1="31" y1="31" x2="${31 + Math.cos((winkelH-90)*Math.PI/180)*r*0.55}"
            y2="${31 + Math.sin((winkelH-90)*Math.PI/180)*r*0.55}" stroke="#444" stroke-width="4"/>
      <line x1="31" y1="31" x2="${31 + Math.cos((winkelM-90)*Math.PI/180)*r*0.8}"
            y2="${31 + Math.sin((winkelM-90)*Math.PI/180)*r*0.8}" stroke="#1976d2" stroke-width="2"/>
      <circle cx="31" cy="31" r="3" fill="#1976d2"/>
    </svg>`;

  const digitalHTML = `
    <div class="zeit-digital">
      <div class="zeit-wochentag">${day}</div>
      <div class="zeit-uhrzeit">${timeStr} Uhr</div>
    </div>`;

  const host = document.getElementById('zeit-widget');
  if (host) {
    host.innerHTML = `
      <div class="infocard-content">
        <div class="zeit-widget-inner">
          ${tageHTML}
          <div class="zeit-main">
            ${uhrSVG}
            ${digitalHTML}
          </div>
        </div>
      </div>`;
  }
}

/* ---------- NEW helpers for weighted adjectives ---------- */

function markerForWeight(w){
  const v = Number(w);
  if (!Number.isFinite(v)) return '•';
  if (v > 0.25) return '▲';
  if (v < -0.25) return '▼';
  return '•';
}

function pickRandom(arr){
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Picks a weighted adjective object from state.adjectivesPeopleWeighted (if available).
 * Returns null if not available/invalid.
 */
function pickWeightedAdjectiveObject(){
  const pool = state.adjectivesPeopleWeighted;
  if (!Array.isArray(pool) || pool.length === 0) return null;

  const item = pickRandom(pool);
  if (!item || typeof item !== 'object') return null;

  const adjective = typeof item.adjective === 'string' ? item.adjective : '';
  const weight = Number(item.connotation_weight);
  const behaviors = Array.isArray(item.behaviors) ? item.behaviors.filter(b => typeof b === 'string' && b.trim()) : [];

  if (!adjective) return null;

  return {
    adjective,
    weight: Number.isFinite(weight) ? weight : 0,
    behaviors
  };
}

export function computeAllViewsForTick(t){
  const worldNodes = getAllNodes();
  const map = {};

  state.persons.forEach(p => {
    const adjMap = {};       // legacy: targetName -> adjective string
    const metaMap = {};      // NEW: targetName -> { weight, behavior, marker }

    worldNodes
      .filter(n => n.name !== p.name)
      .forEach(n => {
        // Personen bekommen (wenn möglich) das neue weighted Modell,
        // Aspekte bleiben wie gehabt bei den String-Listen.
        if (isPerson(n)) {
          const wObj = pickWeightedAdjectiveObject();

          if (wObj) {
            adjMap[n.name] = wObj.adjective;

            const behavior = wObj.behaviors.length ? pickRandom(wObj.behaviors) : '';
            metaMap[n.name] = {
              weight: wObj.weight,
              behavior,
              marker: markerForWeight(wObj.weight)
            };
            return;
          }
        }

        // Fallback (alte Logik): Strings
        const pool = adjectivesPoolFor(n);
        const adj = pool.length ? pool[Math.floor(Math.random()*pool.length)] : '';
        adjMap[n.name] = (typeof adj === 'string') ? adj : String(adj || '');
        metaMap[n.name] = { weight: 0, behavior: '', marker: '•' };
      });

    const genoMap = {};
    worldNodes.forEach(a => {
      worldNodes.forEach(b => {
        if (a.name < b.name) {
          genoMap[[a.name, b.name].join('-')] = pickWeightedRelationForPair(a,b);
        }
      });
    });

    // Wichtig: adjectives bleibt string-map, damit render nicht bricht.
    // meta ist neu und wird im nächsten Schritt in render genutzt.
    map[p.name] = { adjectives: adjMap, adjectiveMeta: metaMap, genogramm: genoMap };
  });

  state.timeline.viewsByTick[t] = map;
}

// ✅ Clean Variant: viewsByTick wird NICHT persistiert (wird immer neu berechnet)
// Zusätzlich: wir persistieren nur die letzten N Ticks (sonst wächst worldByTick endlos)

const MAX_PERSIST_TICKS = 60; // sauber + stabil (anpassbar)

/* ---------- helper: ensure views for tick (lazy rebuild) ---------- */
export function ensureViewsForTick(t){
  if (!state.timeline.viewsByTick) state.timeline.viewsByTick = {};
  if (state.timeline.viewsByTick[t]) return;
  computeAllViewsForTick(t);
}

/* ---------- helper: prune persisted history ---------- */
function pruneTimelineToLast(maxTicks){
  const ticks = Array.isArray(state.timeline.ticks) ? state.timeline.ticks : [0];
  if (ticks.length <= maxTicks) return;

  const keep = ticks.slice(-maxTicks);
  const keepSet = new Set(keep);

  // ticks
  state.timeline.ticks = keep;

  // current muss drin bleiben
  if (!keepSet.has(state.timeline.current)){
    state.timeline.current = keep[keep.length - 1];
  }

  // prune maps
  const pruneMap = (m)=>{
    if (!m || typeof m !== 'object') return {};
    const out = {};
    keep.forEach(t => { if (m[t]) out[t] = m[t]; });
    return out;
  };

  state.timeline.timeByTick  = pruneMap(state.timeline.timeByTick);
  state.timeline.worldByTick = pruneMap(state.timeline.worldByTick);

  // viewsByTick ist rein im-memory; kann komplett neu/lazy kommen
  state.timeline.viewsByTick = {};
}

/* =========================
   ✅ startNewTick (sauber + robust)
   ========================= */
export function startNewTick(trigger){
  // ✅ UI gehört nicht in simulation.js → zentral über Actions
  getActions()?.onTickStart?.({ renderAfter: false });

  // Zeit fortschreiben
  advanceTime();

  // Tick erzeugen
  const next = state.timeline.current + 1;
  state.timeline.ticks.push(next);
  state.timeline.current = next;

  // Welt sichern
  state.timeline.worldByTick[next] = {
    persons: JSON.parse(JSON.stringify(state.persons)),
    aspects: JSON.parse(JSON.stringify(state.aspects))
  };
  state.timeline.timeByTick[next] = {
    dayIndex: state.currentDayIndex, hour: state.currentHour, minute: state.currentMinute
  };

  // Views (nur in-memory)
  ensureViewsForTick(next);

  // Persist (views nicht drin)
  try { persistTimeline(); } catch (e) { console.warn('[timeline] persist failed:', e); }

  // Wichtig: Render immer
  render();
}

/* =========================
   ✅ persistTimeline (OHNE viewsByTick)
   ========================= */
export function persistTimeline(){
  // History begrenzen (sauber + verhindert Wachstum)
  pruneTimelineToLast(MAX_PERSIST_TICKS);

  const payload = {
    ticks: state.timeline.ticks,
    current: state.timeline.current,
    timeByTick: state.timeline.timeByTick,
    worldByTick: state.timeline.worldByTick,

    // ✅ viewsByTick absichtlich NICHT persistiert

    currentDayIndex: state.currentDayIndex,
    currentHour: state.currentHour,
    currentMinute: state.currentMinute
  };

  localStorage.setItem('timeline', JSON.stringify(payload));
}

/* =========================
   ✅ restoreTimeline (views lazy rebuild)
   ========================= */
export function restoreTimeline(){
  // Personen/Aspekte aus Session als Start-World heranziehen
  if (sessionStorage.getItem('persons')) state.persons = JSON.parse(sessionStorage.getItem('persons'));
  state.persons.forEach(p => { if (!p.type) p.type = 'person'; });
  state.aspects = sessionStorage.getItem('aspects') ? JSON.parse(sessionStorage.getItem('aspects')) : [];

  // viewsByTick ist immer in-memory
  state.timeline.viewsByTick = {};

  const raw = localStorage.getItem('timeline');
  if (!raw) {
    state.timeline.ticks = [0];
    state.timeline.current = 0;
    state.timeline.worldByTick[0] = {
      persons: JSON.parse(JSON.stringify(state.persons)),
      aspects:  JSON.parse(JSON.stringify(state.aspects))
    };
    assignColors(); updateModel();
    state.timeline.timeByTick[0] = {
      dayIndex: state.currentDayIndex, hour: state.currentHour, minute: state.currentMinute
    };

    // in-memory views
    ensureViewsForTick(0);

    persistTimeline();
    return;
  }

  try {
    const obj = JSON.parse(raw);

    Object.assign(state.timeline, {
      ticks: obj.ticks || [0],
      current: obj.current || 0,
      timeByTick: obj.timeByTick || {},
      worldByTick: obj.worldByTick || {},
      viewsByTick: {} // ✅ immer leer starten
    });

    // Werktag-/Zeitstatus
    state.currentDayIndex = obj.currentDayIndex ?? 0;
    state.currentHour     = obj.currentHour ?? 7;
    state.currentMinute   = obj.currentMinute ?? 0;

    // Safety: begrenzen (falls alte Payload sehr groß war)
    pruneTimelineToLast(MAX_PERSIST_TICKS);

    // Current world laden
    const w = state.timeline.worldByTick[state.timeline.current] || { persons: [], aspects: [] };
    state.persons = JSON.parse(JSON.stringify(w.persons));
    state.aspects = JSON.parse(JSON.stringify(w.aspects));
    assignColors(); updateModel();

    // ✅ views nur für current Tick (lazy). Weitere Ticks bei Bedarf.
    ensureViewsForTick(state.timeline.current);

  } catch (e) {
    console.warn('[timeline] restore failed, resetting:', e);
    localStorage.removeItem('timeline');
    restoreTimeline();
  }
}

