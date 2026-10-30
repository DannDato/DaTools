/* Orden personal de herramientas: ratón, agarre táctil y teclado. */
(() => {
  'use strict';
  const grid=document.querySelector('.tool-grid');if(!grid)return;
  const cards=[...grid.querySelectorAll(':scope > a.tool')],key='datools.home.card-order.v1';
  const cardId=card=>card.dataset.toolId;
  const announcement=document.getElementById('reorderStatus');
  for(const card of cards){
    card.dataset.toolId=[...card.classList].find(name=>!['tool','group'].includes(name)&&!name.startsWith('is-'));
    card.draggable=false;card.setAttribute('aria-describedby','reorderHint');
    card.querySelectorAll('img').forEach(img=>img.draggable=false);
    // const grip=document.createElement('span');grip.className='tool-grip';grip.textContent='⠿';grip.setAttribute('aria-hidden','true');grip.title='Arrastra para ordenar';
    // card.querySelector('.tool-top').prepend(grip);
  }
  try{
    const stored=JSON.parse(localStorage.getItem(key)||'[]');
    if(Array.isArray(stored)){
      const ordered=[...new Set(stored)].map(id=>cards.find(card=>cardId(card)===id)).filter(Boolean);
      grid.append(...ordered,...cards.filter(card=>!ordered.includes(card)));
    }
  }catch(_){/* El inicio sigue funcionando si no hay almacenamiento disponible. */}
  let gesture=null,blockedUntil=0;
  const save=()=>{try{localStorage.setItem(key,JSON.stringify([...grid.children].map(cardId)));}catch(_){}};
  function announce(card){
    if(announcement)announcement.textContent=`${card.querySelector('h3').textContent}: posición ${[...grid.children].indexOf(card)+1} de ${cards.length}.`;
  }
  function finish(event,commit=true){
    if(!gesture||(event?.pointerId!=null&&event.pointerId!==gesture.pointerId))return;
    const current=gesture;gesture=null;
    if(current.dragging){
      blockedUntil=performance.now()+500;
      if(commit){save();announce(current.card);}else grid.append(...current.original);
      if(current.card.hasPointerCapture(current.pointerId))current.card.releasePointerCapture(current.pointerId);
    }
    grid.querySelectorAll('.is-reordering,.is-drop-target').forEach(card=>card.classList.remove('is-reordering','is-drop-target'));
  }
  // Los enlaces e imágenes tienen un drag nativo que cancela los eventos pointer.
  grid.addEventListener('dragstart',event=>event.preventDefault());
  grid.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||gesture)return;
    const card=event.target.closest('a.tool');if(!card||card.parentElement!==grid)return;
    const touch=event.pointerType==='touch';
    // Solo el agarre usa touch-action:none; el resto de la tarjeta permite hacer scroll.
    if(touch&&!event.target.closest('.tool-grip'))return;
    blockedUntil=0;
    gesture={card,pointerId:event.pointerId,x:event.clientX,y:event.clientY,dragging:false,original:[...grid.children]};
    if(touch)event.preventDefault();
  });
  document.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.pointerId)return;
    const current=gesture;
    if(!current.dragging){
      if(Math.hypot(event.clientX-current.x,event.clientY-current.y)<8)return;
      current.dragging=true;current.card.classList.add('is-reordering');current.card.setPointerCapture(current.pointerId);
    }
    event.preventDefault();
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('a.tool');
    grid.querySelectorAll('.is-drop-target').forEach(card=>card.classList.remove('is-drop-target'));
    if(!target||target===current.card||target.parentElement!==grid)return;
    const order=[...grid.children],forward=order.indexOf(current.card)<order.indexOf(target);
    grid.insertBefore(current.card,forward?target.nextSibling:target);
    // Mover el nodo puede liberar la captura en algunos navegadores.
    current.card.setPointerCapture(current.pointerId);target.classList.add('is-drop-target');
  },{passive:false});
  document.addEventListener('pointerup',event=>finish(event));
  document.addEventListener('pointercancel',event=>finish(event,false));
  window.addEventListener('blur',event=>finish(event,false));
  grid.addEventListener('click',event=>{
    if(performance.now()<blockedUntil){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&gesture){event.preventDefault();finish(null,false);}
  });
  grid.addEventListener('keydown',event=>{
    if(!event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    const card=event.target.closest('a.tool');if(!card)return;
    event.preventDefault();
    const order=[...grid.children],index=order.indexOf(card),columns=getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length;
    const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key];
    const next=Math.max(0,Math.min(order.length-1,index+delta));if(next===index)return;
    const target=order[next];grid.insertBefore(card,next>index?target.nextSibling:target);card.focus();save();announce(card);
  });
})();
