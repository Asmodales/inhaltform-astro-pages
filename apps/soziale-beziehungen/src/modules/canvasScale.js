/*!
 * canvasScale.js – Skalierung des Canvas-Layouts (1440x900) in den verfügbaren Viewport
 * Ziel:
 * - passt das feste SVG (1440x900) in #canvas-viewport ein
 * - skaliert #canvas-scaler per transform: translate(...) scale(...)
 * - Zentrierung NUR noch hier (kein CSS-Centering)
 * - sehr sauber: Scaler wird erst sichtbar, wenn die erste valide Berechnung erfolgt ist
 */

const BASE_W = 1440;
const BASE_H = 900;

let _bound = false;
let _ready = false;
let _rafPending = false;

function getEls() {
  const viewport = document.getElementById('canvas-viewport');
  const scaler   = document.getElementById('canvas-scaler');
  const svg      = document.getElementById('network');
  return { viewport, scaler, svg };
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function markReady(){
  if (_ready) return;
  _ready = true;
  document.documentElement.classList.add('canvas-ready');

  // Loader nach Fade-out entfernen (optional)
  const loader = document.getElementById('canvas-loader');
  if (loader){
    setTimeout(() => loader.remove(), 220);
  }
}

function scheduleRetry(){
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    updateCanvasScale();
  });
}

export function updateCanvasScale() {
  const { viewport, scaler, svg } = getEls();
  if (!viewport || !scaler || !svg) return;

  // verfügbaren Platz messen (Padding berücksichtigen)
  const cs = window.getComputedStyle(viewport);
  const padL = parseFloat(cs.paddingLeft)   || 0;
  const padR = parseFloat(cs.paddingRight)  || 0;
  const padT = parseFloat(cs.paddingTop)    || 0;
  const padB = parseFloat(cs.paddingBottom) || 0;

  const vw = Math.max(0, viewport.clientWidth  - (padL + padR));
  const vh = Math.max(0, viewport.clientHeight - (padT + padB));

  // Layout noch nicht “fertig” (0x0) => nächstes Frame nochmal versuchen
  if (vw <= 0 || vh <= 0) {
    scheduleRetry();
    return;
  }

  // Skalierung: immer vollständig sichtbar
  const scale = clamp(Math.min(vw / BASE_W, vh / BASE_H), 0.01, 3.6);

  // Zentrierung (X und Y) im Innenraum des Viewports
  const scaledW = BASE_W * scale;
  const scaledH = BASE_H * scale;

  const tx = Math.max(0, (vw - scaledW) / 2);
  const ty = Math.max(0, (vh - scaledH) / 2);

  // scaler ist absolut bei (0,0) im Viewport => translate inklusive Padding
  scaler.style.transformOrigin = '0 0';
  scaler.style.transform = `translate(${padL + tx}px, ${padT + ty}px) scale(${scale})`;

  // SVG-Attribute konsistent halten
  svg.setAttribute('width', String(BASE_W));
  svg.setAttribute('height', String(BASE_H));

  // Jetzt ist es sicher: Scaler sichtbar schalten
  markReady();
}

export function initCanvasScale() {
  if (_bound) return;
  _bound = true;

  // Früh rechnen (nächstes Frame nach DOM-Layout)
  requestAnimationFrame(() => updateCanvasScale());

  // Resize / Orientation
  window.addEventListener('resize', () => updateCanvasScale(), { passive: true });
  window.addEventListener('orientationchange', () => updateCanvasScale(), { passive: true });

  // Späte Layout-Änderungen (Fonts, etc.)
  window.addEventListener('load', () => updateCanvasScale(), { passive: true });

  // Optional: wenn Fonts API verfügbar ist, nochmal nach Font-Load rechnen
  if (document.fonts && typeof document.fonts.ready?.then === 'function'){
    document.fonts.ready.then(() => updateCanvasScale()).catch(() => {});
  }
}