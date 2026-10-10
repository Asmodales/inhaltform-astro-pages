// src/modules/selectors.js
// Pure functions: lesen state/uiState und geben abgeleitete Werte zurück.
// Keine Seiteneffekte.

export function getCurrentTick(state) {
  return state.tick ?? 0;
}

export function getWorldAtCurrentTick(state) {
  const t = getCurrentTick(state);
  return state.worldByTick?.[t] ?? state.world ?? null;
}

export function getViewsAtCurrentTick(state) {
  const t = getCurrentTick(state);
  return state.viewsByTick?.[t] ?? state.views ?? null;
}

export function getFocusName(uiState) {
  return uiState.focusPersonName ?? null;
}

export function isGenogrammActive(state) {
  // robust: manche Versionen haben state.viewMode, manche booleans
  // -> hier nur die bestehende Logik zentral abbilden
  return typeof state.isGenogramm === 'boolean'
    ? state.isGenogramm
    : (state.viewMode === 'genogramm');
}

export function hasAnyOverlayOpen(uiState) {
  return !!(
    uiState.activeLineKey ||
    uiState.activeAdjTarget ||
    uiState.activeMenuNode ||
    uiState.activeNameTarget
  );
}