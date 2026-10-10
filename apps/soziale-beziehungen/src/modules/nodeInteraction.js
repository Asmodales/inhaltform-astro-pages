/*!
 * nodeInteraction.js
 * Bindet Interaktionen für Node-Menüs (Hover + Touch Toggle).
 * Ziel: Render zeichnet; Interaktionslogik ist gekapselt.
 */

let menuHovered = false;
let menuTimeout = null;
let menuRecentlyClosed = false;

export function bindNodeMenuInteractions(hoverCircle, hoverGroup, d, deps){
  const { uiState, overlays, showNodeMenu, hideNodeMenu } = deps;

  // Desktop Hover (bestehend)
  hoverCircle.addEventListener("mouseenter", ()=>{ 
    if (menuRecentlyClosed) return;
    menuHovered = true; 
    if (menuTimeout) clearTimeout(menuTimeout);
    showNodeMenu(hoverGroup, d);
  });

  hoverCircle.addEventListener("mouseleave", ()=>{
    menuHovered = false;
    menuTimeout = setTimeout(()=>{ 
        if (!menuHovered){

            // ✅ Sticky-Menü darf NICHT automatisch schließen
            if (uiState.activeMenuNode === d.name) return;

            // ✅ Nicht "alles" schließen – nur das Hover-Menü ausblenden
            hideNodeMenu(true);

            menuRecentlyClosed = true;
            setTimeout(()=>{ menuRecentlyClosed = false; }, 400);
        }
        }, 1500);
  });

  // ✅ Touch/Pointer: Tap toggelt Menü (sticky)
  hoverCircle.addEventListener("pointerdown", (e)=>{
    if (!e || (e.pointerType && e.pointerType === 'mouse')) return; // nur Touch/Pen
    e.preventDefault();
    e.stopPropagation();

    // Toggle/Activate Sticky zentral über OverlayController
    const wasActive = uiState.activeMenuNode === d.name;
    overlays.activateMenu(d.name);

    // Toggle-Off: overlayController hat bereits geschlossen
    if (wasActive) return;

    // Menü anzeigen
    showNodeMenu(hoverGroup, d);

    // ✅ Touch-Guard: Buttons erst nach 250ms aktivieren (verhindert “springt direkt in Modus”)
    const menu = hoverGroup.querySelector('.node-menu');
    if (menu){
      menu.classList.add('touch-opening');
      menu.querySelectorAll('.menu-btn-bg').forEach(btn => btn.style.pointerEvents = 'none');
      setTimeout(()=>{
        menu.querySelectorAll('.menu-btn-bg').forEach(btn => btn.style.pointerEvents = 'auto');
        menu.classList.remove('touch-opening');
      }, 250);
    }
  });
}

export function ensureStickyNodeMenuVisible(hoverGroup, d, deps){
  const { uiState, showNodeMenu } = deps;
  if (uiState.activeMenuNode === d.name){
    showNodeMenu(hoverGroup, d);
  }
}