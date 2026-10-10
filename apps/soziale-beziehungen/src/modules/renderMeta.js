// src/modules/renderMeta.js
// Rendering der Meta-Ansicht (clickState === 2)
// Reines Draw-Modul: liest state, zeichnet/entfernt DOM; keine UI-Transitions.

export function renderMetaOverlay(state, uiState, { getAllNodes, randomVariation } = {}) {
  // alte Meta-Overlays verlässlich entfernen, wenn nicht im Meta-Modus
  if (uiState.clickState !== 2) {
    state.view.g.selectAll('.meta').remove();
    state.view.g.selectAll('.arrow').remove();
    return;
  }

  // Fokus bestimmen: selectedPerson bevorzugen, sonst per Name suchen
  const focus =
    uiState.selectedPerson ||
    (typeof getAllNodes === 'function'
      ? getAllNodes().find(n => n.name === uiState.focusPersonName)
      : null);

  // Wenn kein Fokus: Meta sauber leer lassen
  if (!focus) {
    state.view.g.selectAll('.meta').remove();
    state.view.g.selectAll('.arrow').remove();
    return;
  }

  // Meta neu aufbauen (einfach + stabil)
  state.view.g.selectAll('.meta').remove();
  state.view.g.selectAll('.arrow').remove();

  const vary = (c) => (typeof randomVariation === 'function' ? randomVariation(c) : c);

  const metaData = state.links.map((d, i) => ({
    x1: focus.x, y1: focus.y,
    x2: (d.source.x + d.target.x) / 2,
    y2: (d.source.y + d.target.y) / 2,
    // ✅ Original-Charakter: Variation um focus.metaColor
    color: vary(focus.metaColor || '#1976d2'),
    idx: i
  }));

  // Linien
  state.view.g.selectAll('.meta')
    .data(metaData, d => d.idx)
    .enter()
    .append('line')
    .attr('class', 'meta')
    .attr('x1', d => d.x1).attr('y1', d => d.y1)
    .attr('x2', d => d.x2).attr('y2', d => d.y2)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 2)
    .style('pointer-events', 'none')
    .attr('opacity', 0.95);

  // kleine Pfeilspitzen als Dreiecke (ohne defs/marker-Abhängigkeit)
  state.view.g.selectAll('.arrow')
    .data(metaData, d => d.idx)
    .enter()
    .append('path')
    .attr('class', 'arrow')
    .attr('d', d => {
      const dx = d.x2 - d.x1, dy = d.y2 - d.y1;
      const angle = Math.atan2(dy, dx);
      const size = 12;
      const x = d.x2, y = d.y2;
      const leftX  = x - size * Math.cos(angle - Math.PI / 6);
      const leftY  = y - size * Math.sin(angle - Math.PI / 6);
      const rightX = x - size * Math.cos(angle + Math.PI / 6);
      const rightY = y - size * Math.sin(angle + Math.PI / 6);
      return `M ${x},${y} L ${leftX},${leftY} L ${rightX},${rightY} Z`;
    })
    .attr('fill', d => d.color)
    .style('pointer-events', 'none')
    .attr('opacity', 0.95);

  // Layering (Meta über Links; Nodes bleiben oben)
  state.view.g.selectAll('.link').lower();
  state.view.g.selectAll('.meta').raise();
  state.view.g.selectAll('.arrow').raise();
  state.view.g.selectAll('.node').raise();
}