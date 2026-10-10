/*!
 * render.js – D3-/SVG-Rendering, Hover-Menü & Anzeige-Logik (B/M/G)
 * (c) 2026 Stefan Pätz, Inhalt & Form Beratungsgesellschaft mbH (LöWe – Lösungsorientierte Weiterbildung)
 * Nutzung: loewe-weiterbildung.de
 * Idee dieser Datei: Alles, was zeichnet – inkl. Kantenstile, Figurenbau, Labels, Stats.
 */

import {
  state, isPerson, isAspect, getAllNodes, assignColors, updateModel,
  resolveRelationStyle, resolveRelationLabel, randomVariation, randomFrom,
  ASPECT_STYLE
} from './state.js';
import { uiState } from './uiState.js';
import { ensureViewsForTick } from './simulation.js';
import { bindLinePointerHandlers } from './lineInteraction.js';
import { clearTooltipTimer, scheduleTooltip, clearAllTooltipTimers } from './tooltipScheduler.js';
import { createActions } from './actions.js';
import { hasAnyOverlayOpen } from './selectors.js';
import { bindNodeMenuInteractions, ensureStickyNodeMenuVisible } from './nodeInteraction.js'; 
import { createBubbleInteractions } from './bubbleInteraction.js';
import { createOverlayController } from './overlayController.js';
import { renderMetaOverlay } from './renderMeta.js';
import { applyLabelCollisionElision } from './renderNameElision.js';

let menuHovered = false, menuTimeout = null, menuRecentlyClosed = false;
let linkHitboxClickStopperInstalled = false;
let prevModeSig = null;
let prevTotalNow = null;
let prevNodeCount = null;
let prevTimeSig = null;
let overlays = null;
let actions = null;

const linkHoverTimers = new Map();

/* =========================
   ✅ LOD (Level of Detail)
   =========================
   Ziel (fixe Schwellen):
   - bis 11: Name voll, Adjektiv-Text + Icon
   - 12–15: Figuren kleiner, Adjektive nur als Icon (Bubble zeigt Zuschreibung + Verhalten)
   - ab 16: Figuren sehr klein, Namen bleiben sichtbar,
            bei Kollision wird der Name zu "[…]" (Hover-Bubble zeigt vollen Namen)
*/
const LOD = {
  FULL_LABEL_MAX: 11,         // bis inkl. 11: Name voll, Adjektiv-Text möglich
  ICON_ONLY_MAX: 15,          // 12–15: Adjektiv nur Icon (kein Text)
  COLLISION_FROM: 27,         // ab 27: collision-aware Elision aktiv (Labels bleiben!)

  NAME_TRUNCATE_MAXCHARS: 18  // optional für 12–15 (wenn du kürzen willst)
};

function getLODLevel(total){
  if (total >= LOD.COLLISION_FROM) return 'C';      // ab 16: collision-aware
  if (total > LOD.FULL_LABEL_MAX) return 'B';       // 12–15: Icon-only
  return 'A';                                       // bis 11: voll
}

function truncateText(s, maxChars){
  const str = String(s ?? '');
  if (str.length <= maxChars) return str;
  return str.slice(0, Math.max(1, maxChars - 1)) + '…';
}

function shouldShowNameAlways(total, isFocus){
  // ✅ Name grundsätzlich immer anzeigen (Kollision wird später zu "[…]" elidiert)
  return true;
}

function getNameForLevel(name, total, isFocus){
  // ✅ volle Namen ausgeben (Elision entscheidet später)
  // Optional: wenn du ab 12–15 dennoch leicht kürzen willst:
  // const lvl = getLODLevel(total);
  // if (!isFocus && lvl === 'B') return truncateText(name, LOD.NAME_TRUNCATE_MAXCHARS);
  return String(name ?? '');
}

function shouldShowAdjText(total, isFocus){
  if (isFocus) return true;
  return getLODLevel(total) === 'A'; // nur bis 11
}

/* =========================
   ✅ Label-Positionierung: Alt bis 15, Neu ab 16
   =========================
   - Bis 15: alte links/rechts Logik beibehalten (robust, bewährt)
   - Ab 16: radialer Label-Ring, damit oben/unten nicht „in den Kreis“ laufen
*/
function computeLabelOutwardOffset(total){
  // engerer Label-Ring (näher am Figurenring), wie gewünscht
  if (total <= 16) return 16;
  if (total <= 22) return 20;
  return 24; // ab ~23–30
}

function placeLabelRadially(textEl, tspanName, tspanAdj, node, total, figureScale, labelGap){
  // Wir sind im Node-Group-Koordinatensystem (translate(x,y) ist schon gesetzt).
  // Deshalb positionieren wir relativ zum Node-Zentrum.
  const ang = Math.atan2(node.y, node.x);

  // Grundradius: halbe Figurenbreite (oder Aspect-Radius)
  const FIG_HALF_W_BASE = 105;
  const baseR = isPerson(node)
    ? (FIG_HALF_W_BASE * figureScale)
    : (node._aspectRadius || ASPECT_STYLE.radius);

  // Ring-Abstand nach außen (hier bewusst enger als vorher)
  const outward = computeLabelOutwardOffset(total);

  // radiale Position
  const r = baseR + outward; // labelGap wird ab 16 nicht mehr links/rechts genutzt
  const lx = Math.cos(ang) * r;
  const ly = Math.sin(ang) * r;

  // Anker: rechts/links, bei fast vertikal lieber middle
  const c = Math.cos(ang);
  let anchor = 'middle';
  if (c > 0.22) anchor = 'start';
  else if (c < -0.22) anchor = 'end';

  textEl.setAttribute('x', String(lx));
  textEl.setAttribute('y', String(ly));
  textEl.setAttribute('text-anchor', anchor);
  textEl.setAttribute('dominant-baseline', 'middle');

  // tspans brauchen das gleiche x (sonst springen sie)
  tspanName.setAttribute('x', String(lx));
  tspanName.setAttribute('dy', '0em');

  // Adjektiv-Zeile unter dem Namen (bei vertical: etwas weniger Abstand)
  tspanAdj.setAttribute('x', String(lx));
  tspanAdj.setAttribute('dy', '1.35em');
}

/* ========================= */

export function initSVG(){
  const svgSel = d3.select('#network');
  state.view.width  = +svgSel.attr('width')  || 1440;
  state.view.height = +svgSel.attr('height') || 900;
  state.view.svg = svgSel;

  // Wichtig: g ist auf die MITTE (0,0) gelegt, damit dein Netzwerk im Zentrum koordiniert werden kann.
  state.view.g = svgSel.append('g').attr('transform', `translate(${state.view.width/2},${state.view.height/2})`);

  overlays = createOverlayController({
    uiState,

    // ✅ OverlayController braucht nur Sticky-CSS-Update + "schließbare" Overlays
    applyLineStickyStyles,
    clearAdjectiveBubble,
    clearNameBubble,
    hideNodeMenu,
  });

  actions = createActions({
    state,
    uiState,
    overlays,
    render,
    clearAllStickyUI,
    hideNodeMenu,
    ensureViewsForTick,
  });

  // ✅ Touch/Pointer: Tap ins Leere räumt alles auf; wenn nichts aktiv -> Tick
  // Hinweis: pointerdown statt click, damit Touch sauber funktioniert und kein Doppelfeuer entsteht.
  svgSel.on('pointerdown', function(event){
    if (event.target !== svgSel.node()) return;

    // ✅ Wenn irgendein Sticky/UI aktiv ist: nur UI schließen (kein Tick)
    if (hasAnyOverlayOpen(uiState)){
      actions.closeAllOverlays({ renderAfter: true });
      return;
    }

    // ✅ Sonst normaler Tick
    import('./simulation.js').then(({ startNewTick, renderTimeWidget })=>{
      startNewTick('blank-click'); renderTimeWidget();
    });
  });

  // Standard-Marker
  svgSel.append('defs').append('marker')
    .attr('id','arrow').attr('viewBox','0 -5 10 10').attr('refX',12).attr('refY',0)
    .attr('markerWidth',12).attr('markerHeight',6).attr('orient','auto').attr('markerUnits','strokeWidth')
    .append('path').attr('d','M0,-5L10,0L0,5').attr('fill','currentColor').attr('stroke','none');
}

export function getActions(){
  return actions;
}
export function getOverlays(){
  return overlays;
}

/* =========================
   ✅ Global Sticky-Reset (Tap ins Leere)
   ========================= */
function clearAllStickyUI({ renderAfter = false } = {}){
  overlays?.clearAll?.();

  // Tooltips / overlays
  const tooltip = document.getElementById('tooltip');
  if (tooltip){
    tooltip.style.display = 'none';
    tooltip.removeAttribute('data-active-key');
  }

  // Bubbles
  clearAdjectiveBubble();
  clearNameBubble();

  // Menü
  hideNodeMenu(true);

  // Link-Classes (Sticky/Dimming)
  applyLineStickyStyles();

  if (renderAfter){
    // render() ist sicher; es respektiert states
    render();
  }
}

function createAspectHexagon(r = ASPECT_STYLE.radius) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = document.getElementById('network') || document.querySelector('svg');
  if (!svgEl) return document.createElementNS(SVG_NS, "g");

  // ---- defs sicherstellen ----
  let defs = svgEl.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, "defs");
    svgEl.prepend(defs);
  }

  // ---- Gradient (einmalig) ----
  let grad = defs.querySelector('#aspect-gradient');
  if (!grad) {
    grad = document.createElementNS(SVG_NS, "radialGradient");
    grad.setAttribute('id', 'aspect-gradient');
    grad.setAttribute('cx', '50%');
    grad.setAttribute('cy', '50%');
    grad.setAttribute('r',  '70%');

    const s1 = document.createElementNS(SVG_NS, "stop");
    s1.setAttribute('offset', '0%');
    s1.setAttribute('stop-color', '#d8ebff');

    const s2 = document.createElementNS(SVG_NS, "stop");
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', '#aab1b9ff');

    grad.append(s1, s2);
    defs.appendChild(grad);
  }

  // ---- Glow Filter (einmalig) ----
  let glow = defs.querySelector('#aspect-glow');
  if (!glow) {
    glow = document.createElementNS(SVG_NS, "filter");
    glow.setAttribute('id', 'aspect-glow');
    glow.setAttribute('x', '-50%');
    glow.setAttribute('y', '-50%');
    glow.setAttribute('width', '200%');
    glow.setAttribute('height', '200%');

    const blur = document.createElementNS(SVG_NS, "feGaussianBlur");
    const blurStd = Math.max(3.2, r * 0.085);
    blur.setAttribute('stdDeviation', String(blurStd));
    blur.setAttribute('result', 'coloredBlur');

    const merge = document.createElementNS(SVG_NS, "feMerge");
    const m1 = document.createElementNS(SVG_NS, "feMergeNode");
    m1.setAttribute('in', 'coloredBlur');
    const m2 = document.createElementNS(SVG_NS, "feMergeNode");
    m2.setAttribute('in', 'SourceGraphic');

    merge.append(m1, m2);
    glow.append(blur, merge);
    defs.appendChild(glow);
  } else {
    const blur = glow.querySelector('feGaussianBlur');
    if (blur) {
      const blurStd = Math.max(3.2, r * 0.085);
      blur.setAttribute('stdDeviation', String(blurStd));
    }
  }

  // ---- Proportionale Strichstärken ----
  const strokePulse = Math.max(2.0, r * 0.052);
  const strokePoly  = Math.max(2.2, r * 0.058);

  // ---- Gruppe ----
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute('filter', 'url(#aspect-glow)');

  // ---- Pulse ----
  const pulse = document.createElementNS(SVG_NS, "circle");
  pulse.setAttribute('r', String(r * 0.9));
  pulse.setAttribute('fill', 'none');
  pulse.setAttribute('stroke', '#5fa8ff');
  pulse.setAttribute('stroke-width', String(strokePulse));
  pulse.setAttribute('opacity', '0.45');
  pulse.classList.add('aspect-pulse');
  group.appendChild(pulse);

  // ---- Hexagon ----
  const poly = document.createElementNS(SVG_NS, "polygon");
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * (Math.PI / 3);
    pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`);
  }
  poly.setAttribute('points', pts.join(' '));
  poly.setAttribute('fill', 'url(#aspect-gradient)');
  poly.setAttribute('stroke', '#4a90e2');
  poly.setAttribute('stroke-width', String(strokePoly));
  poly.setAttribute('opacity', '0.98');
  group.appendChild(poly);

  return group;
}

function createFigureGroup(scale = 0.5) {
  const vb = { x:0, y:0, width:210, height:297 };
  const vbCenterX = vb.x + vb.width/2, vbCenterY = vb.y + vb.height/2;

  if (!state.svgParts.body.length || !state.svgParts.armsRight.length || !state.svgParts.eyes.length ||
      !state.svgParts.armsLeft.length || !state.svgParts.mouths.length) {
    return document.createElementNS("http://www.w3.org/2000/svg","g");
  }

  const body      = state.svgParts.body[0];
  const armrechts = randomFrom(state.svgParts.armsRight);
  const augen     = randomFrom(state.svgParts.eyes);
  const armlinks  = randomFrom(state.svgParts.armsLeft);
  const mund      = randomFrom(state.svgParts.mouths);

  function extractElements(svgText){
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    return Array.from(doc.documentElement.children);
  }

  const g = document.createElementNS("http://www.w3.org/2000/svg","g");
  g.setAttribute("transform", `scale(${scale}) translate(${-vbCenterX},${-vbCenterY})`);
  [body, armrechts, augen, armlinks, mund].forEach(txt => {
    extractElements(txt).forEach(el => g.appendChild(el.cloneNode(true)));
  });
  return g;
}

/* ---------- Helpers: Node lookup + Bubble ---------- */
function getNodeByName(name){
  if (!name) return null;
  const all = getAllNodes();
  return all.find(n => n.name === name) || null;
}

/* ✅ HUD-Helper: Stats temporär ausblenden/einblenden */
function setStatsHidden(hidden){
  const el = document.getElementById('hud-stats');
  if (!el) return;
  el.classList.toggle('is-hidden', !!hidden);
}

function clearAdjectiveBubble(){
  state.view.g.selectAll('.adj-bubble').remove();
  setStatsHidden(false);
}

/* --- Name Bubble (Custom, wie Zuschreibung) --- */
function clearNameBubble(){
  state.view.g.selectAll('.name-bubble').remove();
  setStatsHidden(false);
}

function showNameBubble(fullName, anchorEl){
  clearNameBubble();
  if (!fullName || !anchorEl) return;

  const name = String(fullName).trim();
  if (!name) return;

  const measureOpts = { fontSize: 15, fontWeight: 400 };

  // Layout (ähnlich adj-bubble)
  const paddingX = 16;
  const paddingTop = 20;
  const paddingBottom = 12;

  const headerH = 18;
  const headerGap = 8;
  const lineH = 18;

  const maxLines = 6;
  const { width: textWidth, lines } = wrapWithDynamicWidth(name, {
    minWidth: 240,
    maxWidth: 520,
    step: 20,
    maxLines,
    measureOpts
  });
  const safeLines = (lines && lines.length) ? lines : [name];

  // Headerbreite
  const headerW =
    measureTextWidth('Name', { ...measureOpts, fontWeight: 700 });

  let bubbleW = Math.max(textWidth, headerW) + paddingX * 2;
  bubbleW = Math.min(bubbleW, 640);

  const textBlockH = safeLines.length * lineH;

  const bubbleH =
    paddingTop +
    headerH +
    headerGap +
    textBlockH +
    paddingBottom;

  // Positionierung relativ zum Label-Element
  let bubbleX = 0, bubbleY = 0;
  const p = getPointInViewGFromElement(anchorEl, 0, 0);
  if (p){
    const gap = 12;
    // bubble rechts neben dem Label-Anchor, leicht nach unten
    bubbleX = p.x + (bubbleW/2) + 6;
    bubbleY = p.y + (bubbleH/2) + gap;
  }

  const halfW = state.view.width / 2;
  const halfH = state.view.height / 2;
  bubbleX = Math.max(-halfW + bubbleW/2 + 6, Math.min(halfW - bubbleW/2 - 6, bubbleX));
  bubbleY = Math.max(-halfH + bubbleH/2 + 6, Math.min(halfH - bubbleH/2 - 6, bubbleY));

  // Stats ggf. ausblenden (wie bei adj-bubble)
  {
    const inRightZone  = bubbleX > (halfW * 0.25);
    const inBottomZone = bubbleY > (halfH * 0.25);
    setStatsHidden(inRightZone && inBottomZone);
  }

  const g = state.view.g.append('g')
    .attr('class','name-bubble')
    .attr('transform', `translate(${bubbleX},${bubbleY})`)
    .style('pointer-events','none');

  g.append('rect')
    .attr('x', -bubbleW/2)
    .attr('y', -bubbleH/2)
    .attr('rx', 12)
    .attr('ry', 12)
    .attr('width', bubbleW)
    .attr('height', bubbleH)
    .attr('fill', '#fafafa')
    .attr('stroke', '#9aa0a6')
    .attr('stroke-width', 0.85)
    .attr('opacity', 0.94);

  const textX = -bubbleW/2 + paddingX;
  let cursorY = -bubbleH/2 + paddingTop;

  // Header
  const headerText = g.append('text')
    .attr('x', textX)
    .attr('y', cursorY)
    .attr('text-anchor','start')
    .attr('font-family','system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif')
    .attr('font-size', 15)
    .attr('fill', '#111');

  headerText.append('tspan').attr('font-weight', 700).text('Name');

  cursorY += headerH + headerGap;

  // Name (wrapped, kursiv wie Verhalten)
  const nameText = g.append('text')
    .attr('x', textX)
    .attr('y', cursorY)
    .attr('text-anchor','start')
    .attr('font-family','system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif')
    .attr('font-size', 15)
    .attr('fill', '#111');

  safeLines.forEach((ln, i) => {
    nameText.append('tspan')
      .attr('x', textX)
      .attr('dy', i === 0 ? '0em' : (lineH / 12) + 'em')
      .attr('font-style', 'italic')
      .text(ln);
  });
}

/* --- Text measurement (SVG) --- */
let _measureTextEl = null;

function ensureMeasureTextEl(){
  if (_measureTextEl) return _measureTextEl;

  const svgEl =
    document.getElementById('network') ||
    state.view?.g?.node?.()?.ownerSVGElement ||
    document.querySelector('svg');

  if (!svgEl) return null;

  const el = document.createElementNS("http://www.w3.org/2000/svg", "text");
  el.setAttribute('x', '-9999');
  el.setAttribute('y', '-9999');
  el.setAttribute('opacity', '0');
  el.style.pointerEvents = 'none';
  svgEl.appendChild(el);

  _measureTextEl = el;
  return _measureTextEl;
}

function measureTextWidth(text, {
  fontSize = 12,
  fontWeight = 400,
  fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif'
} = {}){
  const el = ensureMeasureTextEl();
  const s = String(text ?? '');

  if (!el) return s.length * 7;

  el.setAttribute('font-size', String(fontSize));
  el.setAttribute('font-weight', String(fontWeight));
  el.setAttribute('font-family', fontFamily);
  el.textContent = s;

  try {
    return el.getComputedTextLength();
  } catch {
    return s.length * 7;
  }
}

function wrapWordsToWidth(text, maxWidthPx, measureOpts){
  const s = String(text || '').trim();
  if (!s) return [];

  const words = s.split(/\s+/);
  const lines = [];
  let line = '';

  for (const w of words){
    const next = line ? (line + ' ' + w) : w;
    if (measureTextWidth(next, measureOpts) > maxWidthPx && line){
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncateLineToWidth(line, maxWidthPx, measureOpts){
  let s = String(line || '');
  if (!s) return s;

  if (measureTextWidth(s, measureOpts) <= maxWidthPx) return s;

  const ell = '…';
  while (s.length > 1 && measureTextWidth(s + ell, measureOpts) > maxWidthPx){
    s = s.slice(0, -1);
  }
  return s.length ? (s + ell) : ell;
}

function wrapWithDynamicWidth(text, {
  minWidth = 260,
  maxWidth = 420,
  step = 20,
  maxLines = 4,
  measureOpts = { fontSize: 15, fontWeight: 400 }
} = {}){
  const clean = String(text || '').trim();
  if (!clean) return { width: minWidth, lines: [] };

  for (let w = minWidth; w <= maxWidth; w += step){
    const lines = wrapWordsToWidth(clean, w, measureOpts);
    if (lines.length <= maxLines){
      return { width: w, lines };
    }
  }

  const lines = wrapWordsToWidth(clean, maxWidth, measureOpts);
  const clipped = lines.slice(0, maxLines);
  if (clipped.length){
    clipped[clipped.length - 1] = truncateLineToWidth(clipped[clipped.length - 1], maxWidth, measureOpts);
  }
  return { width: maxWidth, lines: clipped };
}

function getPointInViewGFromElement(el, localX = 0, localY = 0){
  const svg = document.getElementById('network') || document.querySelector('svg');
  if (!svg) return null;

  const pt = svg.createSVGPoint();
  pt.x = localX;
  pt.y = localY;

  const ctmEl = el.getCTM?.();
  const ctmG  = state.view.g.node()?.getCTM?.();
  if (!ctmEl || !ctmG) return null;

  const pScreen = pt.matrixTransform(ctmEl);
  const pInG = pScreen.matrixTransform(ctmG.inverse());
  return { x: pInG.x, y: pInG.y };
}

/* ---------- Konnotation Badge ---------- */
function getKonnotationBadge(weight){
  const w = Number(weight);
  const val = Number.isFinite(w) ? w : 0;

  if (val >= 0.75) return { kind: 'up',   symbol: '▲', color: '#43a047', value: val };
  if (val <= -0.75) return { kind: 'down', symbol: '▼', color: '#e53935', value: val };
  return { kind: 'mid',  symbol: '●', color: '#1976d2', value: val };
}

/* ---------- Bubble (Adjektiv) ---------- */
function showAdjectiveBubble(focusNode, targetNode, meta, anchorEl, adjectiveText = ''){
  // ✅ Wenn sticky aktiv ist, wird die Bubble als UI-State exportierbar.
  // Wir löschen die Bubble nur, wenn wir explizit schließen (clearAllStickyUI / Toggle Off).
  clearAdjectiveBubble();
  if (!focusNode || !targetNode || !meta) return;

  const speaker = String(focusNode.name ?? '').trim();
  const about   = String(targetNode.name ?? '').trim();

  const badge = getKonnotationBadge(meta.weight);

  const adjRaw  = String(adjectiveText || meta.adjective || meta.adj || '').trim();
  const adjSafe = adjRaw || '…';

  const behaviorRaw = String(meta.behavior || '').trim();
  const behavior = behaviorRaw || '(kein konkretes Verhalten hinterlegt)';
  const behaviorInline = `"${behavior}"`;

  const fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  const fontSize = 15;

  const W_BOLD = 700;
  const W_SEMI = 600;

  const measureOpts = { fontSize, fontWeight: 400 };

  // Layout
  const paddingX = 16;      // vorher 16  -> mehr Innenabstand links/rechts
  const paddingTop = 23;    // vorher 20  -> +3px oben
  const paddingBottom = 14; // vorher 12  -> unten minimal ruhiger
  const RIGHT_SAFETY = 12; // ✅ extra Luft rechts (Italic-/Mess-Abweichung)

  const lineH = 18;
  const gapAfterHeader = 10; // vorher 6  -> Nameblock bekommt Luft
  const gapAfterAdj = 9;     // vorher 6  -> Abstand zum Verhalten

  // ---- Zeile 1 Breite messen
  const header1Parts = [
    { t: speaker, w: W_BOLD },
    { t: ' beschreibt ', w: 400 },
    { t: about, w: W_BOLD },
    { t: ' als', w: 400 }
  ];

  const header1W = header1Parts.reduce((sum, p) => (
    sum + measureTextWidth(p.t, { ...measureOpts, fontWeight: p.w, fontFamily })
  ), 0);

    // ---- Verhalten wrappen (fest auf Innenbreite der Bubble)
    const adjLineW = measureTextWidth(`${adjSafe}:`, { ...measureOpts, fontWeight: W_SEMI, fontFamily });

    const maxLines = 6;
    const MAX_BUBBLE_W = 660;

    // Zielbreite: Bubble orientiert sich an Header/Adj – aber capped
    const targetBubbleW = Math.min(
      Math.max(header1W, adjLineW) + paddingX * 2 + RIGHT_SAFETY,
      MAX_BUBBLE_W
    );

    // Echte Innenbreite für Text (das ist entscheidend!)
    const innerTextW = Math.max(
      260, // Minimum, damit es nicht absurd schmal wird
      targetBubbleW - paddingX * 2 - RIGHT_SAFETY
    );

    // Wrapping: NICHT mehr "dynamic", sondern fix auf innerTextW
    const { lines } = wrapWithDynamicWidth(behaviorInline, {
      minWidth: innerTextW,
      maxWidth: innerTextW,
      step: 20,
      maxLines,
      measureOpts: { ...measureOpts, fontFamily }
    });

    const safeLines = (lines && lines.length) ? lines : [behaviorInline];

  const longestBehaviorLineW = safeLines.reduce((m, ln) => {
    const w = measureTextWidth(ln, { ...measureOpts, fontWeight: 400, fontFamily });
    return Math.max(m, w);
  }, 0);

  let bubbleW = Math.max(header1W, adjLineW, longestBehaviorLineW) + paddingX * 2 + RIGHT_SAFETY;
  bubbleW = Math.min(bubbleW, MAX_BUBBLE_W);

  // Höhe berechnen
  const behaviorBlockH = safeLines.length * lineH;
  const badgeH = 22;

  const bubbleH =
    paddingTop +
    lineH +                 // Header
    gapAfterHeader +
    lineH +                 // Adjektiv
    gapAfterAdj +
    behaviorBlockH +        // Verhalten
    10 +
    badgeH +
    paddingBottom;

  // Position
  const gapBelowLabel = 18;
  let bubbleX = focusNode.x;
  let bubbleY = focusNode.y;

  if (anchorEl){
    const p = getPointInViewGFromElement(anchorEl, 0, 0);
    if (p){
      bubbleX = p.x;
      bubbleY = p.y + (bubbleH/2) + gapBelowLabel;
    }
  }

  const halfW = state.view.width / 2;
  const halfH = state.view.height / 2;
  bubbleX = Math.max(-halfW + bubbleW/2 + 6, Math.min(halfW - bubbleW/2 - 6, bubbleX));
  bubbleY = Math.max(-halfH + bubbleH/2 + 6, Math.min(halfH - bubbleH/2 - 6, bubbleY));

  {
    const inRightZone  = bubbleX > (halfW * 0.25);
    const inBottomZone = bubbleY > (halfH * 0.25);
    setStatsHidden(inRightZone && inBottomZone);
  }

  const g = state.view.g.append('g')
    .attr('class','adj-bubble')
    .attr('transform', `translate(${bubbleX},${bubbleY})`)
    .style('pointer-events','none');

  g.append('rect')
    .attr('x', -bubbleW/2)
    .attr('y', -bubbleH/2)
    .attr('rx', 12)
    .attr('ry', 12)
    .attr('width', bubbleW)
    .attr('height', bubbleH)
    .attr('fill', '#fafafa')
    .attr('stroke', '#9aa0a6')
    .attr('stroke-width', 0.85)
    .attr('opacity', 0.94);

  const textX = -bubbleW/2 + paddingX;
    let cursorY = -bubbleH/2 + paddingTop + 1; // 👈 +1 schiebt den ganzen Textblock minimal nach unten

  // ---- Zeile 1
  const header1 = g.append('text')
    .attr('x', textX)
    .attr('y', cursorY)
    .attr('text-anchor','start')
    .attr('font-family', fontFamily)
    .attr('font-size', fontSize)
    .attr('fill', '#111');

  header1.append('tspan').attr('font-weight', W_BOLD).text(speaker);
  header1.append('tspan').attr('font-weight', 400).text(' beschreibt ');
  header1.append('tspan').attr('font-weight', W_BOLD).text(about);
  header1.append('tspan').attr('font-weight', 400).text(' als');

  cursorY += lineH + gapAfterHeader;

  // ---- Zeile 2: Adjektiv
  const adjLine = g.append('text')
    .attr('x', textX)
    .attr('y', cursorY)
    .attr('text-anchor','start')
    .attr('font-family', fontFamily)
    .attr('font-size', fontSize)
    .attr('fill', '#111');

  adjLine.append('tspan')
    .attr('font-weight', W_SEMI)
    .text(`${adjSafe}:`);

  cursorY += lineH + gapAfterAdj;

  // ---- Zeile 3+: Verhalten (kursiv)
  const behaviorText = g.append('text')
    .attr('x', textX)
    .attr('y', cursorY)
    .attr('text-anchor','start')
    .attr('font-family', fontFamily)
    .attr('font-size', fontSize)
    .attr('fill', '#111');

  safeLines.forEach((ln, i) => {
    behaviorText.append('tspan')
      .attr('x', textX)
      .attr('dy', i === 0 ? '0em' : '1.25em')
      .attr('font-style', 'italic')
      .text(ln);
  });

  // ---- Badge (Symbol + Wert) unten rechts — Positionierung wie in der alten Version
  const badgeCenterY = (bubbleH/2) - paddingBottom - 10;
  const valueX = (bubbleW/2) - paddingX - 4; // ✅ kleine optische Luft

  // ✅ Abstand Icon <-> Wert: neutral braucht mehr Luft (wirkt sonst “zu nah”)
  const iconGap =
    badge.kind === 'mid'  ? 40 :
    badge.kind === 'down' ? 40 :
                            36;

  const symX = valueX - iconGap;

  const opticalDy =
    badge.kind === 'up'  ? -2.0 :
    badge.kind === 'mid' ? -1.5 :
                          0.0;

  const symY = badgeCenterY + opticalDy;

  // Wert ganz rechts
  g.append('text')
    .attr('x', valueX)
    .attr('y', badgeCenterY)
    .attr('text-anchor','end')
    .attr('dominant-baseline','middle')
    .attr('font-family', fontFamily)
    .attr('font-size', fontSize)
    .attr('fill', '#333')
    .text(Number(badge.value).toFixed(1));

  // Symbol links daneben
  if (badge.kind === 'mid'){
    g.append('circle')
      .attr('cx', symX)
      .attr('cy', symY)
      .attr('r', 7)
      .attr('fill', badge.color)
      .attr('opacity', 0.9);
  } else {
    const size = 9;
    const pts = (badge.kind === 'up')
      ? `${symX},${symY-size} ${symX-size},${symY+size} ${symX+size},${symY+size}`
      : `${symX},${symY+size} ${symX-size},${symY-size} ${symX+size},${symY-size}`;

    g.append('polygon')
      .attr('points', pts)
      .attr('fill', badge.color)
      .attr('opacity', 0.9);
  }
}

/* ---------- Hover-Menü ---------- */
function showNodeMenu(hoverGroup, person) {
  hideNodeMenu();
  const menuG = document.createElementNS("http://www.w3.org/2000/svg","g");
  menuG.setAttribute("class","node-menu");
  menuG.setAttribute("transform","translate(0,0)");

  const hoverRect = document.createElementNS("http://www.w3.org/2000/svg","rect");
  hoverRect.setAttribute("x",-60);
  hoverRect.setAttribute("y",-40);
  hoverRect.setAttribute("width",120);
  hoverRect.setAttribute("height",80);
  hoverRect.setAttribute("fill","transparent");
  hoverRect.setAttribute("pointer-events","all");
  menuG.appendChild(hoverRect);

  const buttons = [
    { x:-36, color:"#e3f2fd", border:"#2196f3", action:()=>showBeziehungen(person), icon:state.ICON_BEZIEHUNG },
    { x:  0, color:"#ffcdd2", border:"#e53935", action:()=>toggleGenogramm(person), icon:state.ICON_GENOGRAMM },
    { x:+36, color:"#e8f5e9", border:"#43a047", action:()=>showMeta(person),        icon:state.ICON_META }
  ];

  buttons.forEach(btn=>{
    const circle = document.createElementNS("http://www.w3.org/2000/svg","circle");
    circle.setAttribute("class","menu-btn menu-btn-bg");
    circle.setAttribute("cx",btn.x);
    circle.setAttribute("cy",0);
    circle.setAttribute("r",18);
    circle.setAttribute("fill",btn.color);
    circle.setAttribute("stroke",btn.border);
    circle.setAttribute("stroke-width",2);
    circle.setAttribute("opacity",0.9);
    circle.style.cursor="pointer";
    circle.addEventListener("mouseenter", ()=>circle.classList.add("pop"));
    circle.addEventListener("mouseleave", ()=>circle.classList.remove("pop"));
    circle.addEventListener("click", function(e){
      e.stopPropagation();
      circle.classList.add("clicked");
      menuRecentlyClosed = true;
      setTimeout(()=>{menuRecentlyClosed=false;},450);
      const menuNode = circle.closest('.node-menu');
      const run = ()=>{ btn.action(); hideNodeMenu(true); circle.classList.remove("clicked"); };
      if (menuNode){
        menuNode.classList.remove('visible');
        menuNode.classList.add('shrinking');
        setTimeout(run,230);
      } else run();
    });
    // ✅ Pointerdown: verhindert, dass Touch-Tap den Hintergrund-Reset triggert
    circle.addEventListener("pointerdown", function(e){
      e.preventDefault?.();
      e.stopPropagation?.();
    });

    menuG.appendChild(circle);

    const foreign = document.createElementNS("http://www.w3.org/2000/svg","foreignObject");
    foreign.setAttribute("x",btn.x-10);
    foreign.setAttribute("y",-10);
    foreign.setAttribute("width",20);
    foreign.setAttribute("height",20);
    foreign.setAttribute("pointer-events","none");
    foreign.innerHTML = btn.icon;
    menuG.appendChild(foreign);
  });

  setTimeout(()=>menuG.classList.add('visible'),10);
  menuG.addEventListener("mouseenter", ()=>{ menuHovered=true; if (menuTimeout) clearTimeout(menuTimeout); });
  menuG.addEventListener("mouseleave", ()=>{
    menuHovered=false;
    if (menuTimeout) clearTimeout(menuTimeout);
    menuTimeout = setTimeout(()=>{ if (!menuHovered) hideNodeMenu(); },1500);
  });

  // ✅ Pointerdown im Menü blockt Background-Reset
  menuG.addEventListener("pointerdown", (e)=>{
    e.preventDefault?.();
    e.stopPropagation?.();
  });

  hoverGroup.appendChild(menuG);
}

function hideNodeMenu(fast=false){
  if (menuTimeout) clearTimeout(menuTimeout);
  document.querySelectorAll('.node-menu').forEach(menuG=>{
    if (fast){ menuG.remove(); return; }
    if (!menuG.classList.contains('shrinking')){
      menuG.classList.remove('visible');
      menuG.classList.add('shrinking');
    }
    setTimeout(()=>menuG.remove(),230);
  });
}

export function showBeziehungen(person){
  actions?.showBeziehungen?.(person);
}

export function showMeta(person){
  actions?.showMeta?.(person);
}

export function toggleGenogramm(person){
  actions?.toggleGenogramm?.(person);
}

function makeLinkKey(a, b){
  const n1 = typeof a === 'string' ? a : (a?.name ?? '');
  const n2 = typeof b === 'string' ? b : (b?.name ?? '');
  return [n1, n2].sort().join('-');
}

function showTooltipAtLinkMid(d){
  const tooltip = document.getElementById('tooltip');
  if (!tooltip || !d?.link?.source || !d?.link?.target) return;

  // Nur in echter Genogramm-Ansicht anzeigen
  const key = d.key;
  if (!(state.genogrammMode && uiState.focusPersonName && state.genogrammFocusName === uiState.focusPersonName)) return;
  if (!(key && state.genogrammQualities && state.genogrammQualities[key])) return;

  const desc  = d.styleKey || state.genogrammQualities[key] || "";
  const style = resolveRelationStyle(desc);
  const label = resolveRelationLabel(desc);

  const active = state.genogrammFocusName;
  const nameA = d.link.source.name;
  const nameB = d.link.target.name;

  tooltip.innerHTML =
    `<b>${active}</b> beschreibt die Beziehung<br>`+
    `von <b>${nameA}</b> und <b>${nameB}</b><br>`+
    `als "<span style="color:${style.stroke};font-weight:bold;">${label}</span>"`;
  tooltip.classList.add('tooltip-bubble');
  // Mittelpunkt im g-Koordinatensystem
  const mx = (d.link.source.x + d.link.target.x) / 2;
  const my = (d.link.source.y + d.link.target.y) / 2;

  // g ist zentriert per translate(width/2, height/2)
  const svgX = mx + (state.view.width  / 2);
  const svgY = my + (state.view.height / 2);

  tooltip.style.display = 'block';
  tooltip.style.left = (svgX + 16) + 'px';
  tooltip.style.top  = (svgY - 10) + 'px';
  tooltip.setAttribute('data-active-key', key);
}

function showTooltipAtPinned(d, clientX, clientY){
  const tooltip = document.getElementById('tooltip');
  // ✅ gleiche Optik wie Hover-Tooltip erzwingen
  tooltip.classList.add('tooltip-bubble');
  if (!tooltip || !d?.link?.source || !d?.link?.target) return;

  const key = d.key;
  if (!(state.genogrammMode && uiState.focusPersonName && state.genogrammFocusName === uiState.focusPersonName)) return;
  if (!(key && state.genogrammQualities && state.genogrammQualities[key])) return;

  const desc  = d.styleKey || state.genogrammQualities[key] || "";
  const style = resolveRelationStyle(desc);
  const label = resolveRelationLabel(desc);

  const active = state.genogrammFocusName;
  const nameA = d.link.source.name;
  const nameB = d.link.target.name;

  // (Format bleibt wie gehabt – zentriert, mit fett/farbig)
  tooltip.innerHTML =
    `<b>${active}</b> beschreibt die Beziehung<br>`+
    `von <b>${nameA}</b> und <b>${nameB}</b><br>`+
    `als "<span style="color:${style.stroke};font-weight:bold;">${label}</span>"`;

  const scaler = document.getElementById('canvas-scaler');
  const rect = scaler?.getBoundingClientRect?.();

  // scale(...) aus inline transform lesen (wie bei canvasScale.js gesetzt)
  const t = scaler?.style?.transform || '';
  const mScale = /scale\(([^)]+)\)/.exec(t);
  const scale = mScale ? (parseFloat(mScale[1]) || 1) : 1;

  // client -> scaler-local (Design-Pixel)
  const localX = rect ? ((clientX - rect.left) / scale) : clientX;
  const localY = rect ? ((clientY - rect.top)  / scale) : clientY;

  tooltip.style.display = 'block';
  tooltip.style.left = (localX + 16) + 'px';
  tooltip.style.top  = (localY - 10) + 'px';
  tooltip.setAttribute('data-active-key', key);
}

//* ---------- Linien-/Tooltip-Logik (Pointer + Sticky) ---------- */
function setLinkHoverEvents() {
  const tooltip = document.getElementById('tooltip');

  // Tooltip darf NICHT die Maus abfangen (sonst "Hitbox schwer zu treffen")
  if (tooltip) tooltip.style.pointerEvents = 'none';

  // Sticky-Hover: Timer pro Beziehung (key)

  const selectLinksByKey = (key) =>
    state.view.g.selectAll('.link').filter(ld => ld.key === key);

  function clearTimer(map, key){
    const t = map.get(key);
    if (t) clearTimeout(t);
    map.delete(key);
  }

  // 🔒 Genogramm-Ansicht exakt wie beim Render (sonst Tooltip in "Normalansicht")
  function isGenogrammViewActive(){
    return !!(
      state.genogrammMode &&
      uiState.focusPersonName &&
      state.genogrammFocusName &&
      state.genogrammFocusName === uiState.focusPersonName &&
      state.genogrammQualities
    );
  }

  function isGenogrammKeyActive(key){
    return !!(isGenogrammViewActive() && key && state.genogrammQualities && state.genogrammQualities[key]);
  }

  function bringToFrontForAWhile(key){
    // hovered Links dieses Keys über andere Links
    selectLinksByKey(key).raise();

    // Z-Order korrekt je Modus
    if (uiState.clickState === 2){
      // ✅ Meta-Ansicht: Meta/Arrow dürfen NICHT über den Figuren liegen
      state.view.g.selectAll('.meta').raise();
      state.view.g.selectAll('.arrow').raise();
      state.view.g.selectAll('.node').raise();   // <-- Figuren immer zuletzt/top
    } else {
      // Normal/Beziehungen/Genogramm: Figuren ebenfalls immer on top
      state.view.g.selectAll('.meta').raise();
      state.view.g.selectAll('.arrow').raise();
      state.view.g.selectAll('.node').raise();
    }

    // ✅ WICHTIG: Bubbles IMMER über Nodes halten (sonst “springen”/werden überdeckt)
    state.view.g.selectAll('.adj-bubble').raise();
    state.view.g.selectAll('.name-bubble').raise();
  }

  function applyHotStyle(key){
    clearTimer(linkHoverTimers, key);

    // ✅ Sticky hat Vorrang: wenn anderer key sticky, kein Hover-Highlight für andere
    if (uiState.activeLineKey && uiState.activeLineKey !== key) return;

    selectLinksByKey(key).each(function(ld){
      const el = d3.select(this);

      // Sticky: Klasse bleibt; wir setzen nur is-hot/is-cooling sauber
      el.classed('is-hot', true).classed('is-cooling', false);

      // Wenn sticky aktiv und dies der sticky key ist -> Optik kommt via CSS (.is-sticky)
      if (uiState.activeLineKey === key) return;

      el.interrupt()
        .transition()
        .duration(150)
        .attr('stroke', getLinkOriginalColor(ld.link))
        .attr('stroke-width', 5)
        .attr('stroke-dasharray', getLinkOriginalDash(ld.link));
    });

    bringToFrontForAWhile(key);
  }

  function applyCoolDown(key){
    clearTimer(linkHoverTimers, key);

    // ✅ Sticky bleibt sticky; kein Cooldown
    if (uiState.activeLineKey === key) return;

    const to = setTimeout(() => {
      selectLinksByKey(key).each(function(ld){
        const el = d3.select(this);
        el.classed('is-hot', false).classed('is-cooling', true);

        el.interrupt()
          .transition()
          .duration(300)
          .attr('stroke', getLinkCurrentColor(ld.link))
          .attr('stroke-width', getLinkCurrentWidth(ld.link))
          .attr('stroke-dasharray', getLinkCurrentDash(ld.link));
      });

      linkHoverTimers.delete(key);
    }, 200); // Nachglühen (Highlight)

    linkHoverTimers.set(key, to);
  }

  function hideTooltipNow(force = false){
    if (!tooltip) return;

    // ✅ Sticky-Genogramm: Tooltip NICHT schließen, wenn er zur aktiven sticky Linie gehört
    if (!force){
      const activeKey = tooltip.getAttribute('data-active-key');
      if (uiState.activeLineKey && activeKey === uiState.activeLineKey){
        return;
      }
    }
    tooltip.classList.remove('tooltip-bubble');
    tooltip.style.display = 'none';
    tooltip.removeAttribute('data-active-key');
  }

  function showTooltipNow(event, d){
    const tooltip = document.getElementById('tooltip');
    if (!tooltip || !d?.link?.source || !d?.link?.target) return;

    const key = d.key;

    // Nur in echter Genogramm-Ansicht anzeigen
    if (!(state.genogrammMode && uiState.focusPersonName && state.genogrammFocusName === uiState.focusPersonName)) return;
    if (!(key && state.genogrammQualities && state.genogrammQualities[key])) return;

    // Sticky anderer Key: kein Tooltip-Hover
    if (uiState.activeLineKey && uiState.activeLineKey !== key) return;

    const desc  = d.styleKey || state.genogrammQualities[key] || "";
    const style = resolveRelationStyle(desc);
    const label = resolveRelationLabel(desc);

    const active = state.genogrammFocusName;
    const nameA = d.link.source.name;
    const nameB = d.link.target.name;

    tooltip.innerHTML =
      `<b>${active}</b> beschreibt die Beziehung<br>`+
      `von <b>${nameA}</b> und <b>${nameB}</b><br>`+
      `als "<span style="color:${style.stroke};font-weight:bold;">${label}</span>"`;

    tooltip.classList.add('tooltip-bubble');
    tooltip.style.display = 'block';
    tooltip.setAttribute('data-active-key', key);

    // --- Cursor-Position -> Scaler-Local (Design-Pixel) ---
    const scaler = document.getElementById('canvas-scaler');
    const rect = scaler?.getBoundingClientRect?.();
    const t = scaler?.style?.transform || '';
    const mScale = /scale\(([^)]+)\)/.exec(t);
    const scale = mScale ? (parseFloat(mScale[1]) || 1) : 1;

    // client -> scaler-local
    const localX = rect ? ((event.clientX - rect.left) / scale) : event.clientX;
    const localY = rect ? ((event.clientY - rect.top)  / scale) : event.clientY;

    tooltip.style.left = (localX + 16) + 'px';
    tooltip.style.top  = (localY - 10) + 'px';
  }

  function scheduleTooltipShow(key, event, d){
    if (!tooltip) return;

    // Außerhalb der echten Genogramm-Ansicht sofort sicher schließen
    if (!isGenogrammKeyActive(key)){
      hideTooltipNow();
      return;
    }

    // ✅ Sticky anderer Key: kein Tooltip
    if (uiState.activeLineKey && uiState.activeLineKey !== key) {
      hideTooltipNow();
      return;
    }

    // hide/show-timer für diesen key abbrechen
    clearTooltipTimer(key);

    // kleines Delay gegen Flackern beim "drüberstreifen"
    const showDelay = 80;

    scheduleTooltip(key, showDelay, () => {
      showTooltipNow(event, d);
    });
  }

  function scheduleTooltipHide(key){
    if (!tooltip) return;

    // Außerhalb der echten Genogramm-Ansicht sofort schließen
    if (!isGenogrammViewActive()){
      hideTooltipNow();
      return;
    }

    // ✅ Sticky bleibt sichtbar (Tooltip darf bleiben, wenn er aktiv ist)
    if (uiState.activeLineKey === key) return;

    clearTooltipTimer(key);

    scheduleTooltip(key, 200, () => {
      const activeKey = tooltip.getAttribute('data-active-key');
      if (activeKey === key) hideTooltipNow();
    });
  }

  // Vorherige Handler sauber entfernen
  const hit = state.view.g.selectAll('.link-hitbox');

  hit
    .on('mouseenter', null)
    .on('mousemove', null)
    .on('mouseleave', null)
    .on('pointerenter', null)
    .on('pointermove', null)
    .on('pointerleave', null)
    .on('pointerdown', null)
    .on('click', null);

  // ✅ WICHTIG: verhindere Mouse-Click-Nachlauf (sonst feuert background/pointerdown nochmal)
  // D3 .on('click') funktioniert hier nicht zuverlässig für "capture", daher native addEventListener.
  if (!linkHitboxClickStopperInstalled){
    hit.each(function(){
      this.addEventListener('click', (e)=>{ e.stopPropagation(); }, true);
    });
    linkHitboxClickStopperInstalled = true;
  }

  // --- Smooth hover: throttle pointermove to animation frames ---
  let rafLineMovePending = false;
  let lastLineMoveEvent = null;
  let lastLineMoveData = null;

  bindLinePointerHandlers(hit, {
    uiState,
    overlays,
    isGenogrammViewActive,
    applyHotStyle,
    scheduleTooltipShow,
    showTooltipAtLinkMid,
    showTooltipAtPinned,
    hideTooltipNow,
    applyCoolDown,
    scheduleTooltipHide,
    bringToFrontForAWhile,
    tooltip,
  });
}

function applyStickyLineClasses(){
  const key = uiState.activeLineKey;

  // erst alles resetten
  state.view.g.selectAll('.link')
    .classed('is-sticky', false)
    .classed('is-dimmed', false);

  if (!key) return;

  state.view.g.selectAll('.link').each(function(ld){
    const isMatch = (ld && ld.key === key);
    d3.select(this).classed('is-sticky', isMatch);
    d3.select(this).classed('is-dimmed', !isMatch);
  });
}

/* =========================
   ✅ Sticky CSS Klassen für Linien (exportierbar)
   ========================= */
function applyLineStickyStyles(){
  const active = uiState.activeLineKey;

  // Ohne active: alles clean
  if (!active){
    state.view.g.selectAll('.link')
      .classed('is-sticky', false)
      .classed('is-dimmed', false);

    // auch hot/cooling nicht hart löschen; render() macht das ohnehin
    return;
  }

  // mit active: aktive = sticky, alle anderen dimmed
  state.view.g.selectAll('.link').each(function(d){
    const el = d3.select(this);
    const isThis = (d && d.key === active);
    el.classed('is-sticky', isThis);
    el.classed('is-dimmed', !isThis);
  });
}

function getLinkOriginalColor(d){
  if (state.genogrammMode && uiState.focusPersonName && state.genogrammFocusName === uiState.focusPersonName){
    const key = [d.source.name, d.target.name].sort().join("-");
    const desc = state.genogrammQualities[key];
    const style = resolveRelationStyle(desc);
    return style.stroke;
  }
  return d.color;
}

function getLinkOriginalDash(d){
  if (state.genogrammMode && uiState.focusPersonName && state.genogrammFocusName === uiState.focusPersonName){
    const key = [d.source.name, d.target.name].sort().join("-");
    const desc = state.genogrammQualities[key];
    const style = resolveRelationStyle(desc);
    return style.dasharray || "";
  }
  return "";
}

function getLinkCurrentColor(d){
  if (state.genogrammMode && uiState.focusPersonName && state.genogrammFocusName === uiState.focusPersonName){
    const key = [d.source.name, d.target.name].sort().join("-");
    const desc = state.genogrammQualities[key];
    const style = resolveRelationStyle(desc);
    return style.stroke;
  }
  if (uiState.clickState === 1 && uiState.focusPersonName){
    const getName = p => (typeof p === 'string' ? p : p.name);
    return (getName(d.source) === uiState.focusPersonName || getName(d.target) === uiState.focusPersonName) ? d.color : '#ccc';
  }
  if (uiState.clickState === 2) return '#ccc';
  return d.color;
}

function getLinkCurrentWidth(d){
  if (state.genogrammMode && uiState.focusPersonName && state.genogrammFocusName === uiState.focusPersonName){
    const key = [d.source.name, d.target.name].sort().join("-");
    const desc = state.genogrammQualities[key];
    const style = resolveRelationStyle(desc);
    return style.width;
  }
  if (uiState.clickState === 1 && uiState.focusPersonName){
    const getName = p => (typeof p === 'string' ? p : p.name);
    return (getName(d.source) === uiState.focusPersonName || getName(d.target) === uiState.focusPersonName) ? 3 : 2;
  }
  if (uiState.clickState === 2) return 2;
  return 2;
}

function getLinkCurrentDash(d){
  if (state.genogrammMode && uiState.focusPersonName && state.genogrammFocusName === uiState.focusPersonName){
    const key = [d.source.name, d.target.name].sort().join("-");
    const desc = state.genogrammQualities[key];
    const style = resolveRelationStyle(desc);
    return style.dasharray || "";
  }
  return "";
}

// Pfad-Helper
function createWavePath(x1,y1,x2,y2, amplitude=7, freq=3){
  const steps=Math.max(12,Math.floor(freq*8));
  let d="";
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    const x=x1+(x2-x1)*t;
    const y=y1+(y2-y1)*t + Math.sin(t*Math.PI*freq)*amplitude*(1-2*(t%0.5));
    d += (i===0?"M":"L")+x+","+y+" ";
  }
  return d.trim();
}
function createZigzagPath(x1,y1,x2,y2, height=7, segs=10){
  const dx=(x2-x1)/segs, dy=(y2-y1)/segs;
  let d=`M${x1},${y1} `;
  for(let i=1;i<=segs;i++){
    const x=x1+dx*i;
    const y=y1+dy*i + (i%2===0?height:-height);
    d += `L${x},${y} `;
  }
  return d.trim();
}
function createDoubleLine(x1,y1,x2,y2, offset=4){
  const len=Math.hypot(x2-x1,y2-y1);
  if(len===0) return [`M${x1},${y1} L${x2},${y2}`];
  const dx=(y2-y1)/len*offset, dy=-(x2-x1)/len*offset;
  return [`M${x1+dx},${y1+dy} L${x2+dx},${y2+dy}`, `M${x1-dx},${y1-dy} L${x2-dx},${y2-dy}`];
}
function drawCutSymbols(x1,y1,x2,y2,cuts=4){
  const arr=[];
  for(let i=1;i<=cuts;i++){
    const t=i/(cuts+1);
    const x=x1+(x2-x1)*t, y=y1+(y2-y1)*t;
    const angle=Math.atan2(y2-y1,x2-x1);
    const len=10;
    const dx=Math.cos(angle+Math.PI/2)*len/2, dy=Math.sin(angle+Math.PI/2)*len/2;
    arr.push({x1:x-dx,y1:y-dy,x2:x+dx,y2:y+dy});
  }
  return arr;
}

/* ---------- Fokus-Glow (UI-State, NICHT zeitgebunden) ---------- */
function updateFocusGlow(){
  const nodes = getAllNodes();
  const total = nodes.length;

  const modeActive = (uiState.clickState === 1 || uiState.clickState === 2 || !!state.genogrammMode);
  const focusName = uiState.focusPersonName;

  state.view.g.selectAll('.node').each(function(d){
    if (!isPerson(d)) return;

    const isFocus = !!(focusName && d.name === focusName);

    // Glow-Kreis sicherstellen
    let glow = this.querySelector('circle.focus-glow');
    if (!glow){
      glow = document.createElementNS("http://www.w3.org/2000/svg","circle");
      glow.setAttribute("cx", 0);
      glow.setAttribute("cy", 0);
      glow.setAttribute("class", "focus-glow");
      glow.setAttribute("pointer-events", "none");
      this.insertBefore(glow, this.firstChild || null);
    }

    // Glow skaliert wie Figur
    const s = getFigureScale(total, isFocus);
    glow.setAttribute("r", String(90 * s));
    glow.setAttribute("fill", d.metaColor || "#1976d2");

    const isActiveFocus = !!(modeActive && isFocus);
    glow.setAttribute("opacity", isActiveFocus ? "0.35" : "0");
  });
}

/* ---------- Scale ---------- */
function getFigureScale(n, isFocus = false){
  let s;
  if (n === 1) s = 1.25;
  else if (n === 2) s = 0.95;
  else if (n === 3) s = 0.75;
  else if (n >= 4 && n < 8) s = 0.62;
  else if (n >= 8 && n <= 11) s = 0.40;
  else if (n >= 12 && n <= 15) s = 0.34;
  else s = 0.24; // ab 16: sehr klein, aber Figur bleibt

  // Fokus „voller“
  if (isFocus) s = Math.max(s, 0.42);

  return s;
}

/* ---------- Aspect-Scale (LOD) ---------- */
function getAspectScale(n){
  // grob parallel zu den Figuren, aber etwas konservativer
  let s;
  if (n === 1) s = 1.20;
  else if (n === 2) s = 1.00;
  else if (n === 3) s = 0.85;
  else if (n >= 4 && n < 8) s = 0.72;
  else if (n >= 8 && n <= 11) s = 0.55;
  else if (n >= 12 && n <= 15) s = 0.48;
  else if (n >= 16 && n <= 22) s = 0.40;
  else s = 0.34;

  return s;
}

function getAspectRadius(total){
  const base = ASPECT_STYLE.radius;       // dein “Design-Radius”
  const s = getAspectScale(total);
  return Math.max(18, base * s);          // Untergrenze, damit es nicht “kaputt” wirkt
}

/* ---------- Statistik (HUD) mit per-Zeile Pulse ---------- */
let _lastStats = null;

function pulseStatRow(rowId){
  const row = document.getElementById(rowId);
  if (!row) return;

  row.classList.remove('stat-pulse');
  void row.offsetWidth;
  row.classList.add('stat-pulse');

  clearTimeout(row._pulseTO);
  row._pulseTO = setTimeout(()=>row.classList.remove('stat-pulse'), 380);
}

function updateStats(){
  const nPersons = state.persons.length;
  const nAspects = Array.isArray(state.aspects) ? state.aspects.length : 0;
  const personPerson = nPersons * (nPersons - 1) / 2;
  const personAspect = nPersons * nAspects;
  const relationships = personPerson + personAspect;
  const meta = nPersons * relationships;

  const next = { nPersons, nAspects, relationships, meta };

  const elPersons = document.getElementById('stat-persons');
  const elAspects = document.getElementById('stat-aspects');
  const elRels    = document.getElementById('stat-relationships');
  const elMeta    = document.getElementById('stat-metarelations');

  if (elPersons) elPersons.textContent = nPersons;
  if (elAspects) elAspects.textContent = nAspects;
  if (elRels)    elRels.textContent    = relationships;
  if (elMeta)    elMeta.textContent    = meta;

  if (_lastStats){
    if (_lastStats.nPersons !== next.nPersons) pulseStatRow('stat-row-persons');
    if (_lastStats.nAspects !== next.nAspects) pulseStatRow('stat-row-aspects');
    if (_lastStats.relationships !== next.relationships) pulseStatRow('stat-row-relationships');
    if (_lastStats.meta !== next.meta) pulseStatRow('stat-row-metarelations');
  }

  _lastStats = next;
}

/* =========================
   ✅ LOD-aware Adjektiv Labels
   ========================= */
export function refreshAdjectiveLabels(){
  const t = state.timeline.current;
  const view = uiState.focusPersonName ? state.timeline.viewsByTick[t]?.[uiState.focusPersonName] : null;

  // ✅ Wenn sticky aktiv ist: Bubble NICHT löschen
  if (!uiState.hasAdjectives && !uiState.activeAdjTarget) clearAdjectiveBubble();

  const ns = "http://www.w3.org/2000/svg";
  const nodes = getAllNodes();
  const total = nodes.length;

  const SHOW_ADJ_TEXT = (total <= LOD.FULL_LABEL_MAX);

  const ICON_GAP_PX = 5;
  const ICON_SIZE   = 8;
  const OPACITY     = 0.9;

  state.view.g.selectAll('.node').each(function(d){
    const tspanAdj  = this.querySelector('tspan.adj');
    const iconGroup = this.querySelector('g.adj-icon');

    // reset adj text
    if (tspanAdj) tspanAdj.textContent = '';

    // reset icon group
    if (iconGroup){
      iconGroup.innerHTML = '';
      iconGroup.style.display = 'none';
      iconGroup.removeAttribute('data-target');

      const hit = document.createElementNS(ns, "rect");
      hit.setAttribute("x", -14);
      hit.setAttribute("y", -12);
      hit.setAttribute("width", 28);
      hit.setAttribute("height", 24);
      hit.setAttribute("fill", "transparent");
      hit.setAttribute("class", "adj-icon-hitbox");
      iconGroup.appendChild(hit);
    }

    if (!(uiState.hasAdjectives && uiState.focusPersonName && d.name !== uiState.focusPersonName)) return;

    const val  = view?.adjectives ? (view.adjectives[d.name] || '') : '';
    if (!val) return;

    const isRight = (d.x >= 0);

    if (SHOW_ADJ_TEXT){
      if (tspanAdj) tspanAdj.textContent = `(${val})`;
    } else {
      if (tspanAdj) tspanAdj.textContent = ''; // ab 12: nur Icon
    }

    if (!isPerson(d)) return;

    const meta = view?.adjectiveMeta ? (view.adjectiveMeta[d.name] || null) : null;
    if (!meta || !iconGroup) return;

    const badge = getKonnotationBadge(meta.weight);

    // bbox: bevorzugt Adj-Text, sonst Name, sonst Figure-Fallback
    let bbox = null;

    if (SHOW_ADJ_TEXT && tspanAdj){
      try { bbox = tspanAdj.getBBox(); } catch {}
    }

    if (!bbox){
      const tspanName = this.querySelector('tspan.name');
      if (tspanName){
        try { bbox = tspanName.getBBox(); } catch {}
      }
    }

    if (!bbox){
      // Fallback relativ zur Figur
      const total = nodes.length;
      const isFocus = !!(uiState.focusPersonName && d.name === uiState.focusPersonName);
      const s = getFigureScale(total, isFocus);
      const FIG_HALF_W_BASE = 105;
      const baseR = FIG_HALF_W_BASE * s;

      const iconX = (isRight ? 1 : -1) * (baseR + 18);
      const iconY = -10;

      iconGroup.setAttribute('transform', `translate(${iconX},${iconY})`);
    } else {
      const iconYBase = bbox.y + (bbox.height * 0.55);

      const opticalDy =
        badge.kind === 'up'  ? -2.0 :
        badge.kind === 'mid' ? -1.5 :
                              0.0;

      const iconY = iconYBase + opticalDy;
      const ICON_VIS_W = ICON_SIZE * 2;

      let iconX;
      if (isRight) {
        iconX = bbox.x + bbox.width + ICON_GAP_PX + (ICON_VIS_W / 2);
      } else {
        iconX = bbox.x - ICON_GAP_PX - (ICON_VIS_W / 2);
      }

      iconGroup.setAttribute('transform', `translate(${iconX},${iconY})`);
    }

    iconGroup.style.display = '';
    iconGroup.setAttribute('data-target', d.name);

    if (badge.kind === 'mid'){
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', '0');
      c.setAttribute('cy', '0');
      c.setAttribute('r',  String(ICON_SIZE * 0.85));
      c.setAttribute('fill', badge.color);
      c.setAttribute('opacity', String(OPACITY));
      c.setAttribute('class', 'adj-icon-hit');
      iconGroup.appendChild(c);
    } else {
      const p = document.createElementNS(ns, 'polygon');
      const size = ICON_SIZE;

      const pts = (badge.kind === 'up')
        ? `0,${-size} ${-size},${size} ${size},${size}`
        : `0,${size} ${-size},${-size} ${size},${-size}`;

      p.setAttribute('points', pts);
      p.setAttribute('fill', badge.color);
      p.setAttribute('opacity', String(OPACITY));
      p.setAttribute('class', 'adj-icon-hit');
      iconGroup.appendChild(p);
    }
  });
}

/* =========================
   ✅ Render
   ========================= */
export function render(){
  const tooltip = document.getElementById('tooltip');

  // ✅ Tooltip nur dann hart ausblenden, wenn KEIN sticky Genogramm-Link aktiv ist.
  // Sonst würde render() die "sticky" Bubble direkt wieder töten.
  const keepStickyGenogramTooltip =
    !!(uiState.activeLineKey &&
      state.genogrammMode &&
      uiState.focusPersonName &&
      state.genogrammFocusName === uiState.focusPersonName);

  if (tooltip && !keepStickyGenogramTooltip){
    tooltip.style.display = 'none';
    tooltip.removeAttribute('data-active-key');
  }

  // 🔥 Alle Hover-Highlight-Timer abbrechen
  if (linkHoverTimers){
    linkHoverTimers.forEach(t => clearTimeout(t));
    linkHoverTimers.clear();
  }

  // 🔥 Optional: falls noch "heiße" Klassen aktiv sind, sauber zurücksetzen
  state.view.g.selectAll('.link')
    .classed('is-hot', false)
    .classed('is-cooling', false);

  // ✅ Render ist draw-only: KEINE UI-State-Mutationen hier.
  // Sticky-/Overlay-Resets passieren über overlayController/actions (z. B. beim Moduswechsel, Add/Remove).
  const allNow = getAllNodes();
  const totalNow = allNow.length;

  const modeSig = `${uiState.clickState}|${!!state.genogrammMode}|${state.genogrammFocusName || ''}|${uiState.focusPersonName || ''}`;
  prevModeSig = modeSig;
  prevTotalNow = totalNow;

  // ✅ Sticky CSS-Klassen anwenden (lesen uiState.activeLineKey, schreiben aber keinen State)
  applyLineStickyStyles();

  // ✅ Garantiert, dass Views existieren (wichtig bei lazy Timeline)
  if (state.timeline && typeof state.timeline.current === 'number') {
    ensureViewsForTick(state.timeline.current);
  }

  renderMetaOverlay(state, uiState, { getAllNodes, randomVariation });

  // ✅ Sticky Bubble nicht löschen, sonst Export kaputt
 if (!uiState.hasAdjectives && !uiState.activeAdjTarget) clearAdjectiveBubble();

  // NameBubble nur transient; sticky Name ist direkt im Label
  clearNameBubble();

  // (1) Farben/Links
  assignColors();
  updateModel();

  // (2) Positionen auf Kreis
  const all = getAllNodes();
  const total = all.length;

  const radiusMin = 0;
  const radiusMax = Math.min(state.view.width, state.view.height)/2 - 100;

  let radius = radiusMin;
  if      (total === 1) radius = radiusMin;
  else if (total === 2) radius = 0.45 * radiusMax;
  else if (total === 3) radius = 0.70 * radiusMax;
  else if (total <= 5)  radius = ((total - 1) / 4) * radiusMax;
  else                  radius = radiusMax;

  all.forEach((d,i)=>{
    const ang = 2*Math.PI*i/total;
    d.x = radius*Math.cos(ang);
    d.y = radius*Math.sin(ang);
  });

  // (3) Linien
  state.view.g.selectAll('.link').remove();
  state.view.g.selectAll('.link-label').remove();
  state.view.g.selectAll('.cut-symbol').remove();

  if (state.genogrammMode && uiState.focusPersonName && state.genogrammFocusName === uiState.focusPersonName){
    let pathObjs = [];

    state.links.forEach(d=>{
      const key  = [d.source.name, d.target.name].sort().join("-");
      const desc = state.genogrammQualities[key];
      const style = resolveRelationStyle(desc);

      let paths=[];
      if (style.extra==="double") paths = createDoubleLine(d.source.x,d.source.y,d.target.x,d.target.y,4);
      else if (style.extra==="wave" || style.extra==="wave-pink") paths=[createWavePath(d.source.x,d.source.y,d.target.x,d.target.y,7,15)];
      else if (style.extra==="zigzag") paths=[createZigzagPath(d.source.x,d.source.y,d.target.x,d.target.y,7,12)];
      else paths = [`M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`];

      paths.forEach((p,idx)=>pathObjs.push({ link:d, path:p, key, styleKey:desc, style, idx }));
    });

    for (let i=0;i<state.aspects.length;i++){
      for (let j=i+1;j<state.aspects.length;j++){
        const a=state.aspects[i], b=state.aspects[j];
        const key=[a.name,b.name].sort().join("-");
        const desc = state.genogrammQualities[key] || { kind:'AA', rel:'aehnlichkeit' };
        const style = resolveRelationStyle(desc);

        let paths=[];
        if (style.extra==="double") paths = createDoubleLine(a.x,a.y,b.x,b.y,4);
        else if (style.extra==="wave" || style.extra==="wave-pink") paths=[createWavePath(a.x,a.y,b.x,b.y,7,15)];
        else if (style.extra==="zigzag") paths=[createZigzagPath(a.x,a.y,b.x,b.y,7,12)];
        else paths = [`M${a.x},${a.y} L${b.x},${b.y}`];

        paths.forEach((p,idx)=>pathObjs.push({ link:{source:a,target:b}, path:p, key, styleKey:desc, style, idx }));
      }
    }

    state.view.g.selectAll('.link-hitbox').remove();
    state.view.g.selectAll('.link-hitbox').data(pathObjs, d=>d.key+'-'+d.idx).enter()
      .append('path').attr('class','link-hitbox')
      .attr('d', d=>d.path)
      .attr('stroke','transparent')
      .attr('stroke-width',22)
      .attr('fill','none')
      .attr('pointer-events','stroke');

    const linkSel = state.view.g.selectAll('.link').data(pathObjs, d=>d.key+'-'+d.idx);
    linkSel.exit().remove();
    linkSel.enter().append('path').attr('class','link')
      .merge(linkSel)
      .attr('d', d=>d.path)
      .attr('stroke', d=>d.style.stroke)
      .attr('stroke-width', d=>d.style.width)
      .attr('fill','none')
      .attr('stroke-dasharray', d=>d.style.dasharray || "")
      .attr('opacity', 0.93);

    // ✅ (1) Pointer-Events synchronisieren: NUR Hitbox interaktiv
    state.view.g.selectAll('.link').style('pointer-events', 'none');
    state.view.g.selectAll('.link-hitbox').style('pointer-events', 'stroke');

    state.view.g.selectAll('.cut-symbol').remove();
    pathObjs.forEach(obj=>{
      if (obj.style.extra === "cut"){
        const [x1,y1] = [obj.link.source.x, obj.link.source.y];
        const [x2,y2] = [obj.link.target.x, obj.link.target.y];
        drawCutSymbols(x1,y1,x2,y2,4).forEach(cut=>{
          state.view.g.append("line").attr("class","cut-symbol")
            .attr("x1",cut.x1).attr("y1",cut.y1)
            .attr("x2",cut.x2).attr("y2",cut.y2)
            .attr("stroke",obj.style.stroke)
            .attr("stroke-width",2)
            .attr("opacity",0.93)
            .lower();
        });
      }
    });

    state.view.g.selectAll('.link-hitbox').lower();
    state.view.g.selectAll('.link').raise();
    state.view.g.selectAll('.link-label').remove();

  } else {
    const lineObjs = state.links.map(d=>({
      link:d,
      key: makeLinkKey(d.source, d.target),
      idx:0,
      style:{ stroke:d.color, width:2, dasharray:"" }
    }));

    state.view.g.selectAll('.link-hitbox').remove();
    state.view.g.selectAll('.link-hitbox').data(lineObjs, d=>d.key+'-'+d.idx).enter()
      .append('line').attr('class','link-hitbox')
      .attr('x1', d=>d.link.source.x).attr('y1', d=>d.link.source.y)
      .attr('x2', d=>d.link.target.x).attr('y2', d=>d.link.target.y)
      .attr('stroke','transparent')
      .attr('stroke-width',22)
      .attr('fill','none')
      .attr('pointer-events','stroke');

    const linkSel = state.view.g.selectAll('.link').data(lineObjs, d=>d.key+'-'+d.idx);
    linkSel.exit().remove();
    linkSel.enter().append('line').attr('class','link')
      .merge(linkSel)
      .attr('x1', d=>d.link.source.x).attr('y1', d=>d.link.source.y)
      .attr('x2', d=>d.link.target.x).attr('y2', d=>d.link.target.y)
      .attr('stroke', d=>getLinkCurrentColor(d.link))
      .attr('stroke-width', d=>getLinkCurrentWidth(d.link))
      .attr('opacity', 0.7);

    // ✅ (1) Pointer-Events synchronisieren: NUR Hitbox interaktiv
    state.view.g.selectAll('.link').style('pointer-events', 'none');
    state.view.g.selectAll('.link-hitbox').style('pointer-events', 'stroke');

    state.view.g.selectAll('.link-hitbox').lower();
    state.view.g.selectAll('.link').raise();
    state.view.g.selectAll('.link-label').remove();
  }

  // ✅ Sticky-Klassen nach Link-Rebuild
  applyLineStickyStyles();

  // ✅ Pointer/Sticky Events
  setLinkHoverEvents();

  // ✅ Wenn eine Linie sticky ist (Genogramm), Tooltip nach Render wieder am Mittelpunkt fixieren.
  // render() baut Links/Hitboxes neu auf → wir holen uns ein aktuelles Datum für den activeLineKey.
  if (tooltip && keepStickyGenogramTooltip && uiState.activeLineKey){
    const dSticky = state.view.g
      .selectAll('.link-hitbox')
      .filter(d => d && d.key === uiState.activeLineKey)
      .datum();

    if (dSticky){
      showTooltipAtLinkMid(dSticky);
    }
  }

  /* ===== Nodes: Redraw-Guard (Zeit + Count) ===== */
  const timeSig = `${state.currentDayIndex}|${state.currentHour}|${state.currentMinute}`;
    const needNodeRedraw =
      (prevTimeSig !== timeSig) ||
      (prevNodeCount !== total);

  if (needNodeRedraw){
    state.view.g.selectAll('.node').remove();

    const nodes = getAllNodes();

    // Label-Gap: etwas enger bei vielen Nodes
    const labelGap =
      (nodes.length <= 11) ? 16 :
      (nodes.length <= 15) ? 14 :
                             12;

    // Schriftgröße leicht adaptiv (damit ab 16 nicht „verschwindet“)
    const labelFontSize =
      (nodes.length <= 11) ? 16 :
      (nodes.length <= 15) ? 14 :
      (nodes.length <= 22) ? 13 : 12;

    // ✅ Umschalter: neue Label-Ring-Logik erst ab 16
    const USE_LABEL_RING = (nodes.length >= 16);

    const nodeSel = state.view.g.selectAll('.node').data(nodes, d=>d.name);
    const nodeEnter = nodeSel.enter().append('g')
      .attr('class','node')
      .style('cursor', d=>isPerson(d)?'pointer':'default');

    nodeSel.merge(nodeEnter)
      .attr('transform', d=>`translate(${d.x},${d.y})`)
      .each(function(d){
        d3.select(this).selectAll("*").remove();

        const isFocus = !!(uiState.focusPersonName && d.name === uiState.focusPersonName);
        const s = getFigureScale(nodes.length, isFocus);

        if (isPerson(d)) {
          // Glow
          const glow = document.createElementNS("http://www.w3.org/2000/svg","circle");
          glow.setAttribute("cx",0);
          glow.setAttribute("cy",0);
          glow.setAttribute("r", String(90 * s));
          glow.setAttribute("fill", d.metaColor);
          glow.setAttribute("opacity","0");
          glow.setAttribute("class","focus-glow");
          glow.setAttribute("pointer-events","none");
          this.appendChild(glow);

          // Figur (immer!)
          const figureGroup = createFigureGroup(s);
          figureGroup.classList.add('figure');
          this.appendChild(figureGroup);

          // Hover-Group (Menu)
          const hoverGroup = document.createElementNS("http://www.w3.org/2000/svg","g");
          hoverGroup.setAttribute("class","hover-group");

          const hoverCircle = document.createElementNS("http://www.w3.org/2000/svg","circle");
          hoverCircle.setAttribute("r", String(nodes.length >= 16 ? 36 : 48));
          hoverCircle.setAttribute("fill","transparent");
          hoverCircle.setAttribute("stroke","none");
          hoverCircle.setAttribute("pointer-events","all");
          hoverCircle.classList.add("menu-hover-area");
          hoverGroup.appendChild(hoverCircle);

          bindNodeMenuInteractions(hoverCircle, hoverGroup, d, {
            uiState,
            overlays,
            showNodeMenu,
            hideNodeMenu,
          });

          this.appendChild(hoverGroup);

          ensureStickyNodeMenuVisible(hoverGroup, d, {
            uiState,
            showNodeMenu,
          });

        } else {
          // ✅ Aspect LOD: Radius abhängig von Gesamtanzahl
          const r = getAspectRadius(nodes.length);
          d._aspectRadius = r; // für Label-Positionierung / spätere Nutzung
          const hex = createAspectHexagon(r);
          this.appendChild(hex);
        }

        // ---------- Label (bis 15: alt / ab 16: Label-Ring) ----------
        {
          const textEl = document.createElementNS("http://www.w3.org/2000/svg","text");
          textEl.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif");
          textEl.setAttribute("font-size", String(labelFontSize));
          textEl.style.pointerEvents = "all";
          textEl.style.cursor = "default";

          const tspanName = document.createElementNS("http://www.w3.org/2000/svg","tspan");
          tspanName.setAttribute("class","name");

          const showName = shouldShowNameAlways(nodes.length, isFocus);
          tspanName.textContent = showName ? getNameForLevel(d.name, nodes.length, isFocus) : '';
          textEl.appendChild(tspanName);

          const tspanAdj = document.createElementNS("http://www.w3.org/2000/svg","tspan");
          tspanAdj.setAttribute("class","adj");
          tspanAdj.textContent = ''; // wird in refreshAdjectiveLabels gesetzt
          textEl.appendChild(tspanAdj);

          if (!USE_LABEL_RING){
            // ✅ ALTE LOGIK (bis 15): links/rechts neben Figur
            const FIG_HALF_W_BASE = 105;
            const baseR = isPerson(d)
              ? (FIG_HALF_W_BASE * s)
              : (d._aspectRadius || ASPECT_STYLE.radius);

            const isRight = (d.x >= 0);
            const labelX = (isRight ? +1 : -1) * (baseR + labelGap);
            const anchor = isRight ? "start" : "end";

            textEl.setAttribute("x", labelX);
            textEl.setAttribute("y", 4);
            textEl.setAttribute("text-anchor", anchor);
            textEl.removeAttribute("dominant-baseline");

            tspanName.setAttribute("x", labelX);
            tspanName.setAttribute("dy","0em");

            tspanAdj.setAttribute("x", labelX);
            tspanAdj.setAttribute("dy","1.5em");
          } else {
            // ✅ NEUE LOGIK (ab 16): radial nach außen (Label-Ring, enger)
            placeLabelRadially(textEl, tspanName, tspanAdj, d, nodes.length, s, labelGap);
          }

          this.appendChild(textEl);
        }

        // Adjektiv-Icon NUR für Personen (positioniert in refreshAdjectiveLabels)
        if (isPerson(d)) {
          const ns = "http://www.w3.org/2000/svg";
          const iconG = document.createElementNS(ns, "g");
          iconG.setAttribute("class", "adj-icon");

          iconG.style.display = "none";
          iconG.style.pointerEvents = "all";
          iconG.style.cursor = "default";

          const hit = document.createElementNS(ns, "rect");
          hit.setAttribute("x", -14);
          hit.setAttribute("y", -12);
          hit.setAttribute("width", 28);
          hit.setAttribute("height", 24);
          hit.setAttribute("fill", "transparent");
          hit.setAttribute("class", "adj-icon-hitbox");
          iconG.appendChild(hit);

          this.appendChild(iconG);
        }
      });

    state.view.g.selectAll('.node').raise();

    // Guard-State aktualisieren (render-local)
    prevTimeSig = timeSig;
    prevNodeCount = total;
  }

  // UI-State Updates (unabhängig vom Render-Guard)
  updateFocusGlow();

  refreshAdjectiveLabels();

  const bubbles = createBubbleInteractions({
    state,
    uiState,
    overlays,
    getNodeByName,
    isPerson,
    clearAdjectiveBubble,
    showAdjectiveBubble,
    hideNodeMenu,
    applyLineStickyStyles,
    clearNameBubble,
    refreshAdjectiveLabels,
  });

  // ✅ Sticky Adjektiv-Bubble nachziehen (exportierbar)
  bubbles.refreshStickyAdjectiveBubble();

  // ✅ Collision-aware Name Elision + Hover/Pointer
  applyLabelCollisionElision(state, uiState, getAllNodes(), { collisionFrom: LOD.COLLISION_FROM });
  bubbles.setNameElisionHoverEvents();

  // ✅ Adjektive: Hover + Touch Toggle
  bubbles.setAdjectiveHoverEvents();

    // ✅ Z-Order fix: Meta-Linien müssen IMMER über normalen Links liegen (Meta-Modus)
  if (uiState.clickState === 2) {
    // visuelle Links nach unten
    state.view.g.selectAll('.link').lower();

    // Meta-Layer darüber
    state.view.g.selectAll('.meta').raise();
    state.view.g.selectAll('.arrow').raise();

    // Interaktion bleibt auf Hitbox (liegt über Meta, damit Hover zuverlässig bleibt)
    state.view.g.selectAll('.link-hitbox').raise();
  }

  updateStats();
  state.view.g.selectAll('.node').raise();

  setLinkHoverEvents();
  applyStickyLineClasses();

}

function injectStickyGenogramBubbleIntoSvgClone(cloneSvg){
  // Nur wenn wirklich ein sticky Genogramm-Link aktiv ist
  if (!(uiState.activeLineKey &&
        state.genogrammMode &&
        uiState.focusPersonName &&
        state.genogrammFocusName === uiState.focusPersonName)) {
    return;
  }

  const key = uiState.activeLineKey;
  if (!(key && state.genogrammQualities && state.genogrammQualities[key])) return;

  // Datum des aktiven Links aus den aktuellen Hitboxes holen (stabil, weil bereits gerendert)
  const dSticky = state.view.g
    .selectAll('.link-hitbox')
    .filter(d => d && d.key === key)
    .datum();

  if (!dSticky?.link?.source || !dSticky?.link?.target) return;

  const desc  = dSticky.styleKey || state.genogrammQualities[key] || "";
  const style = resolveRelationStyle(desc);
  const label = resolveRelationLabel(desc);

  const active = state.genogrammFocusName;
  const nameA  = dSticky.link.source.name;
  const nameB  = dSticky.link.target.name;

  const mx = (dSticky.link.source.x + dSticky.link.target.x) / 2;
  const my = (dSticky.link.source.y + dSticky.link.target.y) / 2;

  // In den "Haupt-g"-Layer des SVG-Clone (bei dir ist das der erste <g> unter dem SVG)
  const mainG = cloneSvg.querySelector('g');
  if (!mainG) return;

  const svgns = "http://www.w3.org/2000/svg";

  // bestehendes Export-Bubble ggf. entfernen (falls mehrfach exportiert)
  const existing = cloneSvg.querySelector('#genogram-export-bubble');
  if (existing) existing.remove();

  // --- Shadow Filter (einmalig) ---
  let defs = cloneSvg.querySelector('defs');
  if (!defs){
    defs = document.createElementNS(svgns, 'defs');
    cloneSvg.insertBefore(defs, cloneSvg.firstChild);
  }
  if (!cloneSvg.querySelector('#bubbleShadow')){
    const filter = document.createElementNS(svgns, 'filter');
    filter.setAttribute('id', 'bubbleShadow');
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');

    const feDrop = document.createElementNS(svgns, 'feDropShadow');
    feDrop.setAttribute('dx', '0');
    feDrop.setAttribute('dy', '1.2');
    feDrop.setAttribute('stdDeviation', '1.2');
    feDrop.setAttribute('flood-color', '#000');
    feDrop.setAttribute('flood-opacity', '0.18');

    filter.appendChild(feDrop);
    defs.appendChild(filter);
  }

  const g = document.createElementNS(svgns, 'g');
  g.setAttribute('id', 'genogram-export-bubble');
  g.setAttribute('pointer-events', 'none');

  // Position: ähnlich wie HTML-Tooltip: leicht rechts/oben vom Mittelpunkt
  const ox = mx + 18;
  const oy = my - 14;
  g.setAttribute('transform', `translate(${ox},${oy})`);

  // --- Textzeilen wie im Original ---
  const line1_prefix = `${active}`;            // bold
  const line1_suffix = ` beschreibt`;          // normal
  const line2_a = `die Beziehung von `;
  const line2_b = nameA;                       // bold
  const line2_c = ` und `;
  const line2_d = nameB;                       // bold
  const line3_a = `als "`;
  const line3_b = label;                       // bold + farbig
  const line3_c = `"`;

  // Breite: grob nach längster “sichtbarer” Zeile (besser mit mehr Padding als vorher)
  const plain2 = `die Beziehung von ${nameA} und ${nameB}`;
  const plain3 = `als "${label}"`;
  const maxLen = Math.max((active + " beschreibt").length, plain2.length, plain3.length);

  const width  = Math.min(560, Math.max(320, Math.round(maxLen * 7.4) + 80));
  const height = 88;

  const rect = document.createElementNS(svgns, 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
  rect.setAttribute('rx', '10');
  rect.setAttribute('ry', '10');
  rect.setAttribute('fill', '#fff');
  rect.setAttribute('stroke', '#bdbdbd');
  rect.setAttribute('stroke-width', '1');
  rect.setAttribute('filter', 'url(#bubbleShadow)');

  // Mittige Textausrichtung
  const cx = width / 2;

  const text = document.createElementNS(svgns, 'text');
  text.setAttribute('x', String(cx));
  text.setAttribute('y', '28');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
  text.setAttribute('fill', '#222');

  // Zeile 1
  const l1 = document.createElementNS(svgns, 'tspan');
  l1.setAttribute('x', String(cx));
  l1.setAttribute('dy', '0');
  l1.setAttribute('font-size', '18');

  const l1a = document.createElementNS(svgns, 'tspan');
  l1a.setAttribute('font-weight', '700');
  l1a.textContent = line1_prefix;

  const l1b = document.createElementNS(svgns, 'tspan');
  l1b.setAttribute('font-weight', '400');
  l1b.textContent = line1_suffix;

  l1.appendChild(l1a);
  l1.appendChild(l1b);

  // Zeile 2
  const l2 = document.createElementNS(svgns, 'tspan');
  l2.setAttribute('x', String(cx));
  l2.setAttribute('dy', '22');
  l2.setAttribute('font-size', '16');

  const l2a = document.createElementNS(svgns, 'tspan');
  l2a.setAttribute('font-weight', '400');
  l2a.textContent = line2_a;

  const l2b = document.createElementNS(svgns, 'tspan');
  l2b.setAttribute('font-weight', '700');
  l2b.textContent = line2_b;

  const l2c = document.createElementNS(svgns, 'tspan');
  l2c.setAttribute('font-weight', '400');
  l2c.textContent = line2_c;

  const l2d = document.createElementNS(svgns, 'tspan');
  l2d.setAttribute('font-weight', '700');
  l2d.textContent = line2_d;

  l2.appendChild(l2a);
  l2.appendChild(l2b);
  l2.appendChild(l2c);
  l2.appendChild(l2d);

  // Zeile 3
  const l3 = document.createElementNS(svgns, 'tspan');
  l3.setAttribute('x', String(cx));
  l3.setAttribute('dy', '22');
  l3.setAttribute('font-size', '16');

  const l3a = document.createElementNS(svgns, 'tspan');
  l3a.setAttribute('font-weight', '400');
  l3a.textContent = line3_a;

  const l3b = document.createElementNS(svgns, 'tspan');
  l3b.setAttribute('font-weight', '700');
  l3b.setAttribute('fill', style.stroke || '#d81b60');
  l3b.textContent = line3_b;

  const l3c = document.createElementNS(svgns, 'tspan');
  l3c.setAttribute('font-weight', '400');
  l3c.setAttribute('fill', '#222');
  l3c.textContent = line3_c;

  l3.appendChild(l3a);
  l3.appendChild(l3b);
  l3.appendChild(l3c);

  // Alles an <text> hängen
  text.appendChild(l1);
  text.appendChild(l2);
  text.appendChild(l3);

  g.appendChild(rect);
  g.appendChild(text);
  mainG.appendChild(g);

}

/* ---------- Export/PNG/SVG Buttons ---------- */
(function wireExports(){
  const exportBtn = document.getElementById('export-icon');
  if (exportBtn){
    exportBtn.addEventListener('click', ()=>{
      const svgEl = document.querySelector('#network');
      if (!svgEl) return;

      const clone = svgEl.cloneNode(true);
      injectStickyGenogramBubbleIntoSvgClone(clone);

      const wAttr = parseFloat(svgEl.getAttribute('width') || '');
      const hAttr = parseFloat(svgEl.getAttribute('height') || '');
      const width  =
        (Number.isFinite(wAttr) && wAttr > 0) ? wAttr :
        (svgEl.viewBox?.baseVal?.width  || 900);
      const height =
        (Number.isFinite(hAttr) && hAttr > 0) ? hAttr :
        (svgEl.viewBox?.baseVal?.height || 720);

      const style = document.createElement('style');
      style.innerHTML = Array.from(document.styleSheets).map(ss=>{
        try { return Array.from(ss.cssRules).map(r=>r.cssText).join('\n'); } catch { return ''; }
      }).join('\n');
      clone.insertBefore(style, clone.firstChild);

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(clone);
      if (!svgString.startsWith('<?xml')) svgString = '<?xml version="1.0" encoding="UTF-8"?>\n'+svgString;

      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = 'white';
        ctx.fillRect(0,0,width,height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        const a = document.createElement('a');
        a.download = `netzwerk_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
      };
      img.src = url;
    });
  }

  const exportSvgBtn = document.getElementById('export-icon-svg');
  if (exportSvgBtn){
    exportSvgBtn.addEventListener('click', ()=>{
      const svgEl = document.querySelector('#network');
      if (!svgEl) return;

      const clone = svgEl.cloneNode(true);
      injectStickyGenogramBubbleIntoSvgClone(clone);

      const style = document.createElement('style');
      style.innerHTML = Array.from(document.styleSheets).map(ss=>{
        try { return Array.from(ss.cssRules).map(r=>r.cssText).join('\n'); } catch { return ''; }
      }).join('\n');
      clone.insertBefore(style, clone.firstChild);

      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(clone);
      if (!svgString.startsWith('<?xml')) svgString = '<?xml version="1.0" encoding="UTF-8"?>\n'+svgString;

      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.download = `netzwerk_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.svg`;
      a.href = url;
      a.click();

      setTimeout(()=>URL.revokeObjectURL(url),0);
    });
  }
})();
