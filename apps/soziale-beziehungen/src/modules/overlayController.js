/*!
 * overlayController.js
 * Zentrale Steuerung für Overlay-Exklusivität.
 * Garantiert: nur ein Sticky-Typ gleichzeitig aktiv.
 */

export function createOverlayController(deps){
  const {
    uiState,

    // line
    applyLineStickyStyles,
    applyCoolDown,
    hideTooltipNow,

    // bubbles + menu
    clearAdjectiveBubble,
    clearNameBubble,
    hideNodeMenu,
  } = deps;

  function clearLine() {
    if (uiState.activeLineKey !== null) {
      const prevKey = uiState.activeLineKey;

      // erst State löschen (damit applyCoolDown nicht "sticky => return" macht)
      uiState.activeLineKey = null;

      // Tooltip sofort weg
      hideTooltipNow?.();

      // visuelle Sticky-Klassen aktualisieren (dim/undim, sticky weg)
      applyLineStickyStyles?.();

      // Rück-Animation (schnell) auf "Current"-Style
      applyCoolDown?.(prevKey);
    }
  }

  function clearAdjective() {
    if (uiState.activeAdjTarget !== null || uiState.activeAdjSource !== null) {
      uiState.activeAdjTarget = null;
      uiState.activeAdjSource = null;
      clearAdjectiveBubble?.();
    }
  }

  function clearMenu() {
    if (uiState.activeMenuNode !== null) {
      uiState.activeMenuNode = null;
      hideNodeMenu?.(true);
    }
  }

  function clearName() {
    if (uiState.activeNameTarget !== null) {
      uiState.activeNameTarget = null;
      clearNameBubble?.();
    }
  }

  function clearAll({ keepHover = false } = {}) {
    clearLine();
    clearAdjective();
    clearMenu();
    clearName();

    if (!keepHover) {
      uiState.hoveredLinkKey = null;
    }
  }

  // ✅ Toggle + Switch korrekt:
  // - click gleiche Linie: aus
  // - click andere Linie: alte aus (mit Animation), neue an
  function activateLine(lineKey) {
    clearAdjective();
    clearMenu();
    clearName();
    uiState.hoveredLinkKey = null;

    if (!lineKey) {
      clearLine();
      return;
    }

    // Toggle OFF
    if (uiState.activeLineKey === lineKey) {
      clearLine();
      return;
    }

    // Switch von alter Linie -> neue Linie
    if (uiState.activeLineKey !== null && uiState.activeLineKey !== lineKey) {
      // alte sauber lösen + animieren
      clearLine();
    }

    // neue setzen
    uiState.activeLineKey = lineKey;

    // Sticky-Klassen sofort anwenden (damit dimmen + sticky sofort greift)
    applyLineStickyStyles?.();

    // Tooltip nicht “vererben”
    hideTooltipNow?.();
  }

  function activateAdjective(targetName, sourceName) {
    clearLine();
    clearMenu();
    clearName();

    uiState.hoveredLinkKey = null;

    uiState.activeAdjTarget = targetName;
    uiState.activeAdjSource = sourceName;
  }

  function activateMenu(nodeName) {
    clearLine();
    clearAdjective();
    clearName();

    uiState.hoveredLinkKey = null;

    uiState.activeMenuNode = nodeName;
  }

  function activateName(nameTarget) {
    clearLine();
    clearAdjective();
    clearMenu();

    uiState.hoveredLinkKey = null;

    uiState.activeNameTarget = nameTarget;
  }

  return {
    clearAll,
    activateLine,
    activateAdjective,
    activateName,
    activateMenu,
    clearLine,
    clearAdjective,
    clearMenu,
    clearName,
  };
}