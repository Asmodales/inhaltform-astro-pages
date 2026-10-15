// src/modules/tooltipScheduler.js
// Key-basierter Timer-Scheduler für Tooltips (Show/Hide/Generic).
// Keine DOM-Logik. Nur Timer-Management.

const timers = new Map();

/** Clear timer for a key (if present) */
export function clearTooltipTimer(key) {
  const t = timers.get(key);
  if (t) {
    clearTimeout(t);
    timers.delete(key);
  }
}

/** Set timer for a key, replacing any existing timer */
export function setTooltipTimer(key, timeoutId) {
  clearTooltipTimer(key);
  timers.set(key, timeoutId);
}

/** Convenience: schedule a function after delay for a key */
export function scheduleTooltip(key, delay, fn) {
  clearTooltipTimer(key);
  const to = setTimeout(() => {
    fn?.();
    timers.delete(key);
  }, delay);
  timers.set(key, to);
}

/** Clear all tooltip timers */
export function clearAllTooltipTimers() {
  for (const [, t] of timers) clearTimeout(t);
  timers.clear();
}