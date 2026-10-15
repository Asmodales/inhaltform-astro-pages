/*!
 * app.js – Bootstrap & Orchestrierung für die Teamdynamik-Visualisierung
 * (c) 2026 Stefan Pätz, Inhalt & Form Beratungsgesellschaft mbH (LöWe – Lösungsorientierte Weiterbildung)
 * Nutzung: loewe-weiterbildung.de
 * Idee dieser Datei: Zentraler Einstiegspunkt – initialisiert Daten, SVG/D3, UI und Simulation.
 */

import { state } from './modules/state.js';
import { initData } from './modules/data.js';
import { restoreTimeline, renderTimeWidget } from './modules/simulation.js';
import { initSVG, render } from './modules/render.js';
import { initUI } from './modules/ui.js';
import { initCanvasScale, updateCanvasScale } from './modules/canvasScale.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1) SVG/D3 vorbereiten
  initSVG();

  // ✅ Zeit-Widget sofort rendern (unabhängig von SVG-Assets)
  // Dadurch erscheint die Uhr sofort und nicht erst nach initData().
  renderTimeWidget();

  // 2) Daten laden (Adjektive + SVG-Assets)
  await initData();

  // 3) Timeline wiederherstellen (inkl. Personen/Aspekte aus Session)
  restoreTimeline();

  // 4) Erstes Rendern & Zeit-Widget (optional erneut, falls Timeline/State Einfluss hat)
  render();
  renderTimeWidget();

  // 4b) Canvas-Skalierung initialisieren (oben links, Breite+Höhe)
  initCanvasScale();
  updateCanvasScale();

  // 5) UI-Events
  initUI();

  // (optional) Debug
  if (state.assetsReady) console.log('SVGs geladen!', state.svgParts);
});
