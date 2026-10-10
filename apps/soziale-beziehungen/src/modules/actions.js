// src/modules/actions.js
// Zentrale UI-Actions (ohne Business-Logik).
// Ziel: Keine direkten uiState-Writes quer im Code.

export function createActions(deps) {
  const {
    state,
    uiState,
    overlays,
    render,
    clearAllStickyUI,
    hideTooltipNow,
    hideNodeMenu,
    ensureViewsForTick,
  } = deps;

  function closeAllOverlays({ renderAfter = true } = {}) {
    if (typeof clearAllStickyUI === 'function') {
      clearAllStickyUI({ renderAfter });
      return;
    }

    overlays?.clearAll?.();
    hideTooltipNow?.();
    if (renderAfter) render?.();
  }

    function resetUiView({ renderAfter = true } = {}) {
    // Overlays/Sticky-UI schließen
    closeAllOverlays({ renderAfter: false });

    // UI-Ansicht/Selection zurücksetzen
    uiState.focusPersonName = null;
    uiState.selectedPerson = null;
    uiState.clickState = 0;
    uiState.hasAdjectives = false;

    // Genogramm sauber aus (optional aber stabil)
    state.genogrammMode = false;
    state.genogrammFocusName = null;
    state.genogrammQualities = {};

    if (renderAfter) render?.();
  }
  // ----------------------------
  // Tick lifecycle (UI gehört in Actions, nicht in simulation.js)
  // ----------------------------
  function onTickStart({ renderAfter = true } = {}) {
    resetUiView({ renderAfter });
  }

  function setFocusPerson(personOrName, { renderAfter = true } = {}) {
    const name =
      (typeof personOrName === 'string')
        ? personOrName
        : (personOrName?.name ?? null);

    uiState.focusPersonName = name;

    // selectedPerson ist UI: wir halten es konsistent (Objekt aus state.persons)
    uiState.selectedPerson =
      name ? (state.persons?.find(p => p?.name === name) ?? null) : null;

    if (renderAfter) render?.();
  }

  function clearFocusPerson({ renderAfter = true } = {}) {
    uiState.focusPersonName = null;
    uiState.selectedPerson = null;
    uiState.hasAdjectives = false;
    if (renderAfter) render?.();
  }

  function setClickState(n, { renderAfter = true } = {}) {
    uiState.clickState = n;
    if (renderAfter) render?.();
  }

  // ----------------------------
  // View Switching (ex render.js)
  // ----------------------------

  // Modus-Konvention aus render.js:
  // clickState === 1  -> Beziehungen
  // clickState === 2  -> Meta
  // Genogramm separat über state.genogrammMode (+ FocusName)
  function showBeziehungen(person, { renderAfter = true } = {}) {
    const name = person?.name ?? null;
    closeAllOverlays({ renderAfter: false });
    uiState.focusPersonName = name;
    uiState.hasAdjectives = true;

    // Meta/Genogramm aus
    uiState.clickState = 1;
    state.genogrammMode = false;
    state.genogrammFocusName = null;

    overlays.clearMenu();

    if (renderAfter) render?.();
  }

  function showMeta(person, { renderAfter = true } = {}) {
    const name = person?.name ?? null;
    closeAllOverlays({ renderAfter: false });
    uiState.focusPersonName = name;
    uiState.hasAdjectives = false;

    // Genogramm aus, Meta an
    uiState.clickState = 2;
    state.genogrammMode = false;
    state.genogrammFocusName = null;

    overlays.clearMenu();

    if (renderAfter) render?.();
  }

  function toggleGenogramm(person, { renderAfter = true } = {}) {
    const name = person?.name ?? null;
    closeAllOverlays({ renderAfter: false });
    uiState.focusPersonName = name;
    uiState.hasAdjectives = false;

    const sameFocus = (state.genogrammFocusName === name);

    if (state.genogrammMode && sameFocus) {
      state.genogrammMode = false;
      state.genogrammFocusName = null;
      state.genogrammQualities = {};
    } else {
      state.genogrammMode = true;
      state.genogrammFocusName = name;

      // 🔥 WICHTIG: Views sicherstellen, bevor wir Qualities lesen
      const t = state.timeline.current;
      ensureViewsForTick?.(t);

      const view = state.timeline.viewsByTick[t]?.[name];
      state.genogrammQualities = (view && view.genogramm) ? view.genogramm : {};

      uiState.clickState = 0;
    }

    overlays.clearMenu();

    if (renderAfter) render?.();
  }

    return {
    closeAllOverlays,
    onTickStart,
    resetUiView,
    setFocusPerson,
    clearFocusPerson,
    setClickState,
    showBeziehungen,
    showMeta,
    toggleGenogramm,
  };
}