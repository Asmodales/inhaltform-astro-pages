// src/modules/renderNameElision.js
// Collision-aware Name Elision ("[…]") ab Schwellwert.
// Reines Draw/DOM-Modul: liest state/uiState, setzt Text/Attribute.

function boxesOverlap(a, b, pad = 2) {
  return !(
    (a.x + a.width)  < (b.x - pad) ||
    (b.x + b.width)  < (a.x - pad) ||
    (a.y + a.height) < (b.y - pad) ||
    (b.y + b.height) < (a.y - pad)
  );
}

export function applyLabelCollisionElision(state, uiState, nodes, { collisionFrom } = {}) {
  const threshold = Number.isFinite(collisionFrom) ? collisionFrom : 27;

  // nur ab threshold sinnvoll
  if (!nodes || nodes.length < threshold) {
    // Elision-Flags ggf. zurücksetzen
    state.view.g.selectAll('.node text').each(function () {
      this.removeAttribute('data-elided');
      this.removeAttribute('data-fullname');

      // Optional: wenn vorher "[…]" stand, zurück auf Vollnamen
      const tspanName = this.querySelector('tspan.name');
      const full =
        this.getAttribute('data-fullname-fallback') ||
        this.getAttribute('data-fullname') ||
        '';
      if (tspanName && full) tspanName.textContent = full;
    });
    return;
  }

  const items = [];

  state.view.g.selectAll('.node').each(function (d) {
    // ✅ NICHT mehr auf Personen beschränken -> Aspekte auch elidieren
    const isFocus = !!(uiState.focusPersonName && d.name === uiState.focusPersonName);

    const textEl = this.querySelector('text');
    const tspanName = this.querySelector('tspan.name');
    if (!textEl || !tspanName) return;

    // Fokus nie elidieren
    if (isFocus) {
      const fullName = String(d.name ?? '');
      tspanName.textContent = fullName;
      textEl.removeAttribute('data-elided');
      textEl.setAttribute('data-fullname', fullName);
      textEl.setAttribute('data-fullname-fallback', fullName);
      return;
    }

    const fullName = String(d.name || '').trim();
    if (!fullName) return;

    // Volltext setzen für BBox-Messung
    tspanName.textContent = fullName;
    textEl.removeAttribute('data-elided');
    textEl.setAttribute('data-fullname', fullName);
    textEl.setAttribute('data-fullname-fallback', fullName);

    let bbox;
    try { bbox = textEl.getBBox(); } catch { return; }

    items.push({ d, textEl, tspanName, fullName, bbox });
  });

  // deterministisch: oben->unten, links->rechts
  items.sort((a, b) => (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x));

  // 1) Collision-Test
  const placed = [];
  let collidedAny = false;

  for (const it of items) {
    let bbox;
    try { bbox = it.textEl.getBBox(); } catch { continue; }

    const collision = placed.some(p => boxesOverlap(bbox, p.bbox, 3));
    if (collision) collidedAny = true;

    placed.push({ bbox });
  }

  // 2) Wenn irgendwo Kollision => alle Nicht-Fokus elidieren (inkl. Aspekte)
  if (collidedAny) {
    for (const it of items) {
      const isFocus = !!(uiState.focusPersonName && it.d.name === uiState.focusPersonName);
      if (isFocus) continue;

      // Wenn Name sticky angezeigt werden soll: nicht elidieren
      if (uiState.activeNameTarget && it.fullName === uiState.activeNameTarget) {
        it.tspanName.textContent = it.fullName;
        it.textEl.removeAttribute('data-elided');
        it.textEl.setAttribute('data-fullname', it.fullName);
        continue;
      }

      it.tspanName.textContent = '[…]';
      it.textEl.setAttribute('data-elided', '1');
      it.textEl.setAttribute('data-fullname', it.fullName);
    }
    return;
  }

  // 3) Sonst: keine Kollision => alle voll lassen
  for (const it of items) {
    it.tspanName.textContent = it.fullName;
    it.textEl.removeAttribute('data-elided');
    it.textEl.setAttribute('data-fullname', it.fullName);
  }
}