'use strict';

// Animotion: solo distribución. Los nodos originales y los eventos del motor se conservan.
(() => {
  const grid = document.getElementById('animotionDock');
  if (!grid) return;

  const notice = document.getElementById('animotionDockNotice');
  const storageKey = 'animotion.workspace.v2';
  // Preset aprobado: Proyecto/JSON | Dirección IA | Vista previa/Escenas | Apariencia/Exportación.
  // Una fila mide 16px (8px de celda + 8px de separación); las alturas de cada
  // columna suman 106 filas para mantener sus bases alineadas.
  const defaults = {
    project:    {cols:16, rows:36},
    json:       {cols:16, rows:70},
    direction:  {cols:16, rows:106},
    preview:    {cols:48, rows:40},
    scenes:     {cols:48, rows:66},
    appearance: {cols:16, rows:77},
    export:     {cols:16, rows:29}
  };
  // Los primeros cuatro ocupan toda la anchura; CSS Grid coloca los siguientes
  // debajo de su compañero de columna gracias a grid-auto-flow: row dense.
  const defaultOrder = ['project','direction','preview','appearance','json','scenes','export'];
  const cards = new Map([...grid.querySelectorAll('.anim-dock-card')].map(card => [card.dataset.dock, card]));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const compact = () => window.innerWidth <= 1690;
  const activeExport = () => typeof exporting !== 'undefined' && exporting;
  const constrain = (value, min, max) => Math.min(max, Math.max(min, value));
  const minWidths = {project:260,appearance:255,preview:450,export:220,direction:270,scenes:300,json:240};
  const minRows = {project:24,appearance:24,preview:25,export:18,direction:24,scenes:23,json:24};
  let drag = null;
  let resizing = null;

  function units() {
    const style = getComputedStyle(grid);
    const gapX = parseFloat(style.columnGap) || 0;
    const gapY = parseFloat(style.rowGap) || 0;
    const row = parseFloat(style.gridAutoRows) || 8;
    return {x: (grid.clientWidth - 95 * gapX) / 96 + gapX, y: row + gapY};
  }

  function minCols(card) {
    if (compact()) return 1;
    const step = Math.max(3, units().x);
    return constrain(Math.ceil(minWidths[card.dataset.dock] / step), 10, 96);
  }

  function setSize(card, cols, rows) {
    const c = constrain(Math.round(cols), minCols(card), 96);
    const r = constrain(Math.round(rows), minRows[card.dataset.dock], 170);
    card.dataset.cols = String(c);
    card.dataset.rows = String(r);
    card.style.gridColumn = `span ${c}`;
    card.style.gridRow = `span ${r}`;
  }

  function readSaved() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!data || !Array.isArray(data.order) || typeof data.sizes !== 'object') return null;
      if (data.order.length !== defaultOrder.length || new Set(data.order).size !== defaultOrder.length) return null;
      if (!data.order.every(id => cards.has(id))) return null;
      return data;
    } catch { return null; }
  }

  function save() {
    const state = {
      version:1,
      order:[...grid.querySelectorAll('.anim-dock-card')].map(card => card.dataset.dock),
      sizes:Object.fromEntries([...cards].map(([id,card]) => [id, {cols:Number(card.dataset.cols),rows:Number(card.dataset.rows)}]))
    };
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { notice.textContent = 'No se pudo guardar la distribución en este navegador.'; }
  }

  function animateReflow(mutate, exclude = null) {
    if (reducedMotion || compact()) { mutate(); return; }
    const start = new Map();
    for (const card of cards.values()) {
      if (card !== exclude && card.isConnected && card.style.display !== 'none') {
        card.getAnimations().forEach(a => a.cancel());
        start.set(card, card.getBoundingClientRect());
      }
    }
    mutate();
    for (const [card, rect] of start) {
      const now = card.getBoundingClientRect();
      const dx = rect.left - now.left, dy = rect.top - now.top;
      if (Math.hypot(dx,dy) < 2) continue;
      card.animate([{transform:`translate3d(${dx}px,${dy}px,0)`},{transform:'translate3d(0,0,0)'}],
        {duration:260,easing:'cubic-bezier(.18,.84,.22,1)'});
    }
  }

  function restore(useDefault = false) {
    const state = useDefault ? null : readSaved();
    const order = state?.order || defaultOrder;
    for (const id of order) grid.appendChild(cards.get(id));
    for (const id of defaultOrder) {
      const current = state?.sizes?.[id];
      setSize(cards.get(id), Number(current?.cols ?? defaults[id].cols), Number(current?.rows ?? defaults[id].rows));
    }
    if (useDefault || !state) save();
  }

  const reset = document.getElementById('resetAnimotionDock');
  reset.addEventListener('click', () => {
    if (drag || resizing || activeExport()) return;
    animateReflow(() => restore(true));
    notice.textContent = 'Distribución original restaurada.';
  });

  function screenScrollWheel(event) {
    // Scroll general como Submotion; Alt + rueda o scrollbar para scroll interno.
    if (event.altKey || event.ctrlKey || event.metaKey || activeExport()) return;
    const textarea = event.target.closest('textarea');
    if (textarea && textarea === document.activeElement && textarea.scrollHeight > textarea.clientHeight) return;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (max < 2) return;
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * factor;
    if ((delta < 0 && window.scrollY < 1) || (delta > 0 && window.scrollY >= max - 1)) return;
    event.preventDefault();
    window.scrollBy({top:delta,behavior:'instant'});
  }
  grid.addEventListener('wheel', screenScrollWheel, {passive:false});

  function createOutline() {
    const outline = document.createElement('div');
    outline.className = 'anim-dock-outline';
    document.body.appendChild(outline);
    return outline;
  }

  function setOutline(event) {
    if (!resizing) return;
    Object.assign(resizing.outline.style, {
      left:resizing.rect.left + 'px', top:resizing.rect.top + 'px',
      width:Math.max(70,resizing.rect.width + event.clientX - resizing.x) + 'px',
      height:Math.max(70,resizing.rect.height + event.clientY - resizing.y) + 'px'
    });
  }

  function resizeMove(event) {
    if (!resizing || event.pointerId !== resizing.pointerId) return;
    event.preventDefault();
    const {card,x,y,cols,rows,unitX,unitY} = resizing;
    const nextCols = cols + Math.round((event.clientX-x)/unitX);
    const nextRows = rows + Math.round((event.clientY-y)/unitY);
    if (nextCols !== Number(card.dataset.cols) || nextRows !== Number(card.dataset.rows)) {
      animateReflow(() => setSize(card,nextCols,nextRows),card);
    }
    setOutline(event);
  }

  function endResize(event, commit) {
    if (!resizing || event.pointerId !== resizing.pointerId) return;
    const state = resizing;
    resizing = null;
    window.removeEventListener('pointermove',resizeMove);
    window.removeEventListener('pointerup',resizeEnd);
    window.removeEventListener('pointercancel',resizeCancel);
    state.outline.remove();
    state.card.classList.remove('is-resizing');
    document.body.classList.remove('anim-resizing');
    if (commit) {save(); notice.textContent = 'Tamaño guardado.';}
    else setSize(state.card,state.cols,state.rows);
  }
  function resizeEnd(event) { endResize(event,true); }
  function resizeCancel(event) { endResize(event,false); }

  function beginResize(event, card) {
    if (compact() || activeExport() || drag || resizing || event.button !== 0) return;
    event.preventDefault();
    const unit = units();
    resizing = {card,pointerId:event.pointerId,x:event.clientX,y:event.clientY,
      cols:Number(card.dataset.cols),rows:Number(card.dataset.rows),
      unitX:unit.x,unitY:unit.y,rect:card.getBoundingClientRect(),outline:createOutline()};
    setOutline(event);
    card.classList.add('is-resizing');
    document.body.classList.add('anim-resizing');
    window.addEventListener('pointermove',resizeMove,{passive:false});
    window.addEventListener('pointerup',resizeEnd);
    window.addEventListener('pointercancel',resizeCancel);
  }

  function createGhost(title) {
    const ghost = document.createElement('div');
    ghost.className = 'anim-dock-ghost';
    ghost.textContent = title;
    document.body.appendChild(ghost);
    return ghost;
  }
  function moveGhost(event) {
    if (!drag?.ghost) return;
    drag.ghost.style.left = `${event.clientX}px`;
    drag.ghost.style.top = `${event.clientY}px`;
  }
  function startDrag(event) {
    drag.active = true;
    const card = drag.card;
    drag.placeholder = document.createElement('div');
    drag.placeholder.className = 'anim-dock-placeholder';
    drag.placeholder.textContent = 'Soltar aquí';
    drag.placeholder.style.gridColumn = card.style.gridColumn;
    drag.placeholder.style.gridRow = card.style.gridRow;
    card.after(drag.placeholder);
    card.style.display = 'none';
    drag.ghost = createGhost(card.querySelector('.dock-heading h2')?.textContent || 'Panel');
    document.body.classList.add('anim-dragging');
    moveGhost(event);
  }
  function changePlaceholder(event) {
    if (!drag?.active) return;
    const hovered = document.elementFromPoint(event.clientX,event.clientY);
    const target = hovered?.closest('.anim-dock-card');
    if (!target || target === drag.card || !grid.contains(target)) return;
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height/2 ||
      (Math.abs(event.clientY-(rect.top+rect.height/2)) < rect.height*.26 && event.clientX < rect.left+rect.width/2);
    if (before && target.previousElementSibling === drag.placeholder) return;
    if (!before && target.nextElementSibling === drag.placeholder) return;
    animateReflow(() => target[before ? 'before' : 'after'](drag.placeholder),drag.card);
  }
  function dragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX-drag.x,event.clientY-drag.y) > 6) startDrag(event);
    if (!drag.active) return;
    event.preventDefault();
    moveGhost(event);
    const margin = 65;
    if (event.clientY < margin) window.scrollBy({top:-18,behavior:'instant'});
    if (event.clientY > window.innerHeight-margin) window.scrollBy({top:18,behavior:'instant'});
    changePlaceholder(event);
  }
  function endDrag(event,commit) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const state = drag;
    drag = null;
    window.removeEventListener('pointermove',dragMove);
    window.removeEventListener('pointerup',dragEnd);
    window.removeEventListener('pointercancel',dragCancel);
    if (!state.active) return;
    state.ghost.remove();
    document.body.classList.remove('anim-dragging');
    if (commit) {
      state.placeholder.replaceWith(state.card);
      state.card.style.display = '';
      save();
      notice.textContent = 'Orden guardado.';
    } else {
      state.placeholder.remove();
      state.card.style.display = '';
      for (const id of state.oldOrder) grid.appendChild(cards.get(id));
    }
  }
  function dragEnd(event) {endDrag(event,true);}
  function dragCancel(event) {endDrag(event,false);}
  function beginDrag(event,card) {
    if (activeExport() || drag || resizing || event.button !== 0) return;
    event.preventDefault();
    drag = {card,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false,
      oldOrder:[...grid.querySelectorAll('.anim-dock-card')].map(c=>c.dataset.dock)};
    window.addEventListener('pointermove',dragMove,{passive:false});
    window.addEventListener('pointerup',dragEnd);
    window.addEventListener('pointercancel',dragCancel);
  }

  for (const card of cards.values()) {
    card.querySelector('.dock-resizer').addEventListener('pointerdown',event => beginResize(event,card));
    card.querySelector('.dock-resizer').addEventListener('keydown',event => {
      if (compact() || activeExport() || drag || resizing || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 4 : 1;
      animateReflow(() => setSize(card, Number(card.dataset.cols)+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),
        Number(card.dataset.rows)+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)),card);
      save();
    });
    const grip = card.querySelector('.dock-grip');
    grip.addEventListener('pointerdown',event => beginDrag(event,card));
    grip.addEventListener('keydown',event => {
      if (activeExport() || drag || resizing || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const list = [...grid.querySelectorAll('.anim-dock-card')];
      const index = list.indexOf(card);
      const delta = ['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1;
      if (index+delta < 0 || index+delta >= list.length) return;
      animateReflow(() => grid.insertBefore(card, delta>0 ? list[index+delta].nextSibling : list[index+delta]));
      save(); grip.focus();
    });
  }

  const preview = cards.get('preview');
  const fullscreenBtn = document.getElementById('fullscreenPreview');
  fullscreenBtn.addEventListener('click',async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await preview.requestFullscreen();
    } catch(error) { notice.textContent = `No se pudo abrir pantalla completa: ${error.message}`; }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.textContent = document.fullscreenElement === preview ? '✕ Salir' : '⛶ Pantalla completa';
  });

  // Mantener proporciones sensatas al variar la ventana, sin sobrescribir lo guardado.
  let oldWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth-oldWidth)<8 || drag || resizing) return;
    oldWidth = window.innerWidth;
    if (compact()) return;
    for (const card of cards.values()) setSize(card,Number(card.dataset.cols),Number(card.dataset.rows));
  });

  restore();
})();
