/*!
 * uiState.js – Transienter UI-Zustand (nicht Teil der Timeline)
 * Quelle der Wahrheit für UI/Overlay/Sticky-Zustände.
 */

export const uiState = {
  // UI-State (transient)
  clickState: 0,
  selectedPerson: null,
  focusPersonName: null,
  hasAdjectives: false,

  // Sticky / Hover / Overlay-Targets
  activeLineKey: null,     // sticky line key
  pinnedTooltipPos: null,
  activeAdjTarget: null,   // Name der Zielperson/-aspekt für Adjektivbubble
  activeAdjSource: null,   // Name der Quelle (z.B. focusPersonName)
  activeMenuNode: null,    // Node-Name, dessen Menü gerade offen ist
  activeNameTarget: null,  // Name-Bubble target (für elidierte Namen)
  // Tooltip-Pin-Position (für sticky Genogramm-Tooltip)
  // bleibt absichtlich im UI-State (nicht persistent)
  pinnedTooltip: null, // { key: string, x: number, y: number } in PAGE px (pageX/pageY)
};