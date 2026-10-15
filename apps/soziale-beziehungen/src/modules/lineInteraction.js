/*!
 * lineInteraction.js
 * Bindet Pointer-Interaktionen für Genogramm-Linien/Hitboxes.
 * Ziel: Render zeichnet, Interaction-Modul verwaltet Events.
 */

export function bindLinePointerHandlers(hitSelection, deps) {
  const {
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
  } = deps;

  // --- Smooth hover: throttle pointermove to animation frames ---
  let rafLineMovePending = false;
  let lastLineMoveEvent = null;
  let lastLineMoveData = null;

  function getPageXY(ev){
    const x = (typeof ev?.pageX === 'number') ? ev.pageX : (ev?.clientX ?? 0) + (window.scrollX || 0);
    const y = (typeof ev?.pageY === 'number') ? ev.pageY : (ev?.clientY ?? 0) + (window.scrollY || 0);
    return { x, y };
  }

  // ✅ Pointer (unified)
  hitSelection
    .on('pointerenter', function(event, d){
      if (!d || !d.key) return;

      // Hover nur für Maus
      if (event && event.pointerType && event.pointerType !== 'mouse') return;

      // Hover (Hot-Style) darf in allen Ansichten funktionieren.
      // Tooltip nur in Genogramm-Ansicht.
      const allowTooltip = isGenogrammViewActive();

      // Sticky anderer Key -> kein Hover
      if (uiState.activeLineKey && uiState.activeLineKey !== d.key) return;

      applyHotStyle(d.key);

      if (allowTooltip){
        // ✅ Wenn diese Linie sticky ist: Tooltip wirklich "angeheftet" zeigen
        if (uiState.activeLineKey === d.key && uiState.pinnedTooltip?.key === d.key && showTooltipAtPinned){
          showTooltipAtPinned(d, uiState.pinnedTooltip.x, uiState.pinnedTooltip.y);
        } else {
          scheduleTooltipShow(d.key, event, d);
        }
      }
    })

    .on('pointermove', function(event, d){
      if (!tooltip) return;
      if (!d || !d.key) return;

      // Merken: wir verarbeiten nur den letzten Move pro Frame
      lastLineMoveEvent = event;
      lastLineMoveData = d;

      if (rafLineMovePending) return;
      rafLineMovePending = true;

      requestAnimationFrame(() => {
        rafLineMovePending = false;

        const ev = lastLineMoveEvent;
        const dd = lastLineMoveData;
        if (!ev || !dd || !dd.key) return;

        // Wenn wir nicht in der echten Genogramm-Ansicht sind: Tooltip sicher aus
        if (!isGenogrammViewActive()){
          return;
        }

        // Sticky anderer Key -> Tooltip aus
        if (uiState.activeLineKey && uiState.activeLineKey !== dd.key) {
          hideTooltipNow();
          return;
        }

        // ✅ Wenn diese Linie sticky ist: Tooltip komplett in Ruhe lassen (bleibt wo er angepinnt wurde)
        if (uiState.activeLineKey === dd.key) {
          return;
        }

        const activeKey = tooltip.getAttribute('data-active-key');
        if (tooltip.style.display === 'block' && activeKey && activeKey === dd.key) {

          const scaler = document.getElementById('canvas-scaler');
          const rect = scaler?.getBoundingClientRect?.();
          const t = scaler?.style?.transform || '';
          const mScale = /scale\(([^)]+)\)/.exec(t);
          const scale = mScale ? (parseFloat(mScale[1]) || 1) : 1;

          // client -> scaler-local (Design-Pixel)
          const localX = rect ? ((ev.clientX - rect.left) / scale) : ev.clientX;
          const localY = rect ? ((ev.clientY - rect.top)  / scale) : ev.clientY;

          tooltip.style.left = (localX + 16) + 'px';
          tooltip.style.top  = (localY - 10) + 'px';
        }
      });
    })

    .on('pointerleave', function(event, d){
      if (!d || !d.key) return;

      // Hover nur für Maus
      if (event && event.pointerType && event.pointerType !== 'mouse') return;

      // Sticky -> kein cooldown / kein tooltip-hide
      if (uiState.activeLineKey === d.key) return;

      applyCoolDown(d.key);
      // Tooltip sofort schließen (Scheduler kann intern trotzdem Debounce machen)
      if (isGenogrammViewActive()){
        hideTooltipNow();
        scheduleTooltipHide?.(d.key);
      }
    })

    .on('pointerdown', function(event, d){
      if (!d || !d.key) return;

      event.preventDefault?.();
      event.stopPropagation?.();

      // Vorher merken, ob diese Linie schon sticky war
      const wasSticky = (uiState.activeLineKey === d.key);

      overlays.activateLine(d.key);

      const isNowSticky = (uiState.activeLineKey === d.key);

      if (isNowSticky){
        applyHotStyle(d.key);
        bringToFrontForAWhile(d.key);

        // ✅ Tooltip an Klickposition pinnen (und NICHT an Linienmitte)
        hideTooltipNow(true);

        // 1) Pin-Position speichern (Client-Koordinaten)
        const x = event.clientX ?? 0;
        const y = event.clientY ?? 0;
        uiState.pinnedTooltip = { key: d.key, x, y, space: 'client' };

        // 2) Tooltip sofort an Pin-Position zeigen
        if (showTooltipAtPinned){
          showTooltipAtPinned(d, x, y);
        } else {
          showTooltipAtLinkMid?.(d);
        }
      } else {
        // Toggle-Off
        hideTooltipNow(true);
      }
    });

  return hitSelection;
}