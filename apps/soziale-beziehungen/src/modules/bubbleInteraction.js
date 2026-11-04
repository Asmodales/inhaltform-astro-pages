/*!
 * bubbleInteraction.js
 * Interaktions-Logik für:
 * - sticky Adjektiv-Bubble (refresh nach render)
 * - Adjektiv-Icon Hover/Pointer
 * - Name-Elision Hover/Pointer (voller Name anzeigen)
 *
 * Render zeichnet weiterhin die Bubble (showAdjectiveBubble/clear…).
 */

export function createBubbleInteractions(deps){
  const {
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
  } = deps;

  function refreshStickyAdjectiveBubble(){
    // Sticky nur sinnvoll, wenn wir im Beziehungen-Modus sind und Fokus existiert
    if (!uiState.activeAdjTarget || !uiState.activeAdjSource) return;

    // Wenn Fokus gewechselt hat, Bubble schließen
    if (uiState.focusPersonName !== uiState.activeAdjSource) {
      overlays.clearAdjective();
      return;
    }

    if (!uiState.hasAdjectives || !uiState.focusPersonName) {
      overlays.clearAdjective();
      return;
    }

    const t = state.timeline.current;
    const view = state.timeline.viewsByTick[t]?.[uiState.focusPersonName];
    if (!view) {
      overlays.clearAdjective();
      return;
    }

    const targetNode = getNodeByName(uiState.activeAdjTarget);
    if (!targetNode || !isPerson(targetNode)) return;

    const focusNode = getNodeByName(uiState.focusPersonName);
    if (!focusNode) return;

    const meta = view.adjectiveMeta ? view.adjectiveMeta[uiState.activeAdjTarget] : null;
    if (!meta) return;

    // Anchor: Icon-Element im DOM suchen (exportierbar, stabil)
    const anchor = state.view.g.selectAll('.adj-icon')
      .filter(function(){
        return this.getAttribute('data-target') === uiState.activeAdjTarget;
      })
      .node();

    if (!anchor) {
      // Wenn Icon gerade nicht existiert (z.B. LOD/Modus), schließen
      overlays.clearAdjective();
      return;
    }

    const adjectiveText = view.adjectives ? (view.adjectives[uiState.activeAdjTarget] || '') : '';
    showAdjectiveBubble(focusNode, targetNode, meta, anchor, adjectiveText);
  }

  function setAdjectiveHoverEvents(){
    // Reset Listener
    state.view.g.selectAll('.adj-icon')
      .on('mouseenter.adj', null)
      .on('mouseleave.adj', null)
      .on('pointerenter.adj', null)
      .on('pointerleave.adj', null)
      .on('pointerdown.adj', null);

    if (!uiState.hasAdjectives || !uiState.focusPersonName) {
      // Wenn sticky aktiv: Bubble NICHT einfach wegräumen (exportierbar!)
      if (!uiState.activeAdjTarget) clearAdjectiveBubble();
      return;
    }

    const t = state.timeline.current;
    const view = state.timeline.viewsByTick[t]?.[uiState.focusPersonName];
    if (!view) return;

    const onEnter = function(event){
      // Wenn eine sticky Bubble aktiv ist: Hover nur für genau dieses Target oder gar nicht
      if (uiState.activeAdjTarget) {
        const targetName = this.getAttribute('data-target');
        if (targetName !== uiState.activeAdjTarget) return;
      }

      const targetName = this.getAttribute('data-target');
      if (!targetName || targetName === uiState.focusPersonName) return;

      const targetNode = getNodeByName(targetName);
      if (!targetNode || !isPerson(targetNode)) return;

      const focusNode = getNodeByName(uiState.focusPersonName);
      if (!focusNode) return;

      const meta = view.adjectiveMeta ? view.adjectiveMeta[targetName] : null;
      if (!meta) return;

      const adjectiveText = view.adjectives ? (view.adjectives[targetName] || '') : '';
      showAdjectiveBubble(focusNode, targetNode, meta, this, adjectiveText);
    };

    const onLeave = function(){
      // Sticky -> nicht schließen
      if (uiState.activeAdjTarget) return;

      if (this._adjBubbleTimeout) clearTimeout(this._adjBubbleTimeout);
      this._adjBubbleTimeout = setTimeout(() => clearAdjectiveBubble(), 180);
    };

    const onDown = function(event){
      const targetName = this.getAttribute('data-target');
      if (!targetName || targetName === uiState.focusPersonName) return;

      // Touch: kein Nachklick/Selektion, und verhindert Background-Tick/Reset
      event.preventDefault?.();
      event.stopPropagation?.();

      // Toggle Sticky zentral über overlayController
      overlays.activateAdjective(targetName, uiState.focusPersonName);

      // Wenn Toggle-Off passiert ist, sind die Werte jetzt null -> nichts mehr anzeigen
      if (
        uiState.activeAdjTarget !== targetName ||
        uiState.activeAdjSource !== uiState.focusPersonName
      ) return;

      // Bubble sofort zeigen
      const targetNode = getNodeByName(targetName);
      const focusNode  = getNodeByName(uiState.focusPersonName);
      if (!targetNode || !focusNode) return;

      const meta = view.adjectiveMeta ? view.adjectiveMeta[targetName] : null;
      if (!meta) return;

      const adjectiveText = view.adjectives ? (view.adjectives[targetName] || '') : '';
      showAdjectiveBubble(focusNode, targetNode, meta, this, adjectiveText);
    };

    // Desktop Hover (legacy) + Pointer (unified)
    state.view.g.selectAll('.adj-icon')
      .on('mouseenter.adj', onEnter)
      .on('mouseleave.adj', onLeave)
      .on('pointerenter.adj', function(event){
        if (event && event.pointerType && event.pointerType !== 'mouse') return;
        onEnter.call(this, event);
      })
      .on('pointerleave.adj', function(event){
        if (event && event.pointerType && event.pointerType !== 'mouse') return;
        onLeave.call(this, event);
      })
      .on('pointerdown.adj', onDown);
  }

  function setNameElisionHoverEvents(){
    // alte Listener entfernen
    state.view.g.selectAll('.node text')
      .on('mouseenter.name', null)
      .on('mouseleave.name', null)
      .on('pointerenter.name', null)
      .on('pointerleave.name', null)
      .on('pointerdown.name', null);

      state.view.g.selectAll('.node g.adj-icon')
      .on('pointerenter.name', null)
      .on('pointerleave.name', null);

    state.view.g.selectAll('.node')
      .on('pointerleave.name', null);


    const onEnter = function(event){
      const elided = this.getAttribute('data-elided') === '1';
      if (!elided) return;

      // wenn eine sticky Name-Anzeige aktiv ist, nur das gleiche Label bedienen
      if (uiState.activeNameTarget){
        const full = this.getAttribute('data-fullname') || '';
        if (full !== uiState.activeNameTarget) return;
      }

      const full = this.getAttribute('data-fullname') || '';
      if (!full) return;

      clearNameBubble?.();

      const tspanName = this.querySelector('tspan.name');
      if (!tspanName) return;

      if (!this._namePrevText) this._namePrevText = tspanName.textContent;

      tspanName.textContent = full;
      this.classList.add('name-show-full');
      this.setAttribute('data-elided-hover', '1');
      refreshAdjectiveLabels?.();
    };

    const onLeave = function(event){
      // sticky -> nicht zurücksetzen (wird durch Tap ins Leere geräumt)
      if (uiState.activeNameTarget) return;

      // Wenn der Pointer innerhalb derselben .node bleibt (z.B. Text -> Icon), NICHT zurücksetzen
      const node = this.closest?.('.node');
      const rt = event?.relatedTarget;
      if (node && rt && node.contains(rt)) return;

      const wasHover = this.getAttribute('data-elided-hover') === '1';
      if (!wasHover) return;

      const tspanName = this.querySelector('tspan.name');
      if (!tspanName) return;

      tspanName.textContent = '[…]';
      this.classList.remove('name-show-full');
      this.removeAttribute('data-elided-hover');
      refreshAdjectiveLabels?.();
    };

    const onDown = function(event){
      const elided = this.getAttribute('data-elided') === '1';
      if (!elided) return;

      const full = this.getAttribute('data-fullname') || '';
      if (!full) return;

      event.preventDefault?.();
      event.stopPropagation?.();

      // Toggle/Activate Sticky zentral über OverlayController (Name)
      overlays.activateName(full);

      // Wenn Controller alles geräumt hat (Toggle-Off), abbrechen + zurück auf elidiert
      if (uiState.activeNameTarget !== full) {
      const tspanName = this.querySelector('tspan.name');
      if (tspanName) tspanName.textContent = '[…]';
      this.classList.remove('name-show-full');
      this.removeAttribute('data-elided-hover');
      return;
      }

      // ✅ FIX (B9): alle anderen elidierten Namen zurücksetzen, damit nicht mehrere "sichtbar" bleiben
      state.view.g.selectAll('.node text[data-elided="1"]').each(function(){
        const t = this.querySelector('tspan.name');
        const fullName = this.getAttribute('data-fullname') || '';
        if (!t) return;
        if (fullName && fullName !== full){
          t.textContent = '[…]';
          this.classList.remove('name-show-full');
          this.removeAttribute('data-elided-hover');
        }
      });

      // direkt zeigen
      const tspanName = this.querySelector('tspan.name');
      if (tspanName) tspanName.textContent = full;
      this.classList.add('name-show-full');
      refreshAdjectiveLabels?.();
    };

    state.view.g.selectAll('.node text')
      .on('mouseenter.name', onEnter)
      .on('mouseleave.name', onLeave)
      .on('pointerenter.name', function(event){
        if (event && event.pointerType && event.pointerType !== 'mouse') return;
        onEnter.call(this, event);
      })
      .on('pointerleave.name', function(event){
        if (event && event.pointerType && event.pointerType !== 'mouse') return;
        onLeave.call(this, event);
      })
      .on('pointerdown.name', onDown);
  }
  return {
    refreshStickyAdjectiveBubble,
    setAdjectiveHoverEvents,
    setNameElisionHoverEvents,
  };
}