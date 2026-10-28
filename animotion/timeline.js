'use strict';

var timelineEditor = (() => {
  const root=document.createElement('section');root.className='timeline-panel';root.hidden=true;
  root.setAttribute('aria-label','Línea de tiempo editable');
  root.innerHTML='<div class="timeline-heading"><h2>Línea de tiempo</h2><button type="button" class="help-icon" title="Arrastra las barras para moverlas y sus extremos para cambiar inicio o final. La marca interior ajusta la entrada. Las escenas se recortan o amplían sin reescalar sus animaciones. Alt desactiva el ajuste de 0,05 s." aria-label="Ayuda de la línea de tiempo">!</button><span id="timelineCurrent">0 s</span><div class="timeline-zoom"><button type="button" id="timelineZoomOut" aria-label="Alejar línea de tiempo">−</button><button type="button" id="timelineFit">Ajustar</button><button type="button" id="timelineZoomIn" aria-label="Acercar línea de tiempo">+</button></div></div><div class="timeline-scroll" tabindex="0" aria-label="Pistas de escenas y objetos"><div class="timeline-content"></div></div>';
  $('sceneEditor').before(root);
  const viewport=root.querySelector('.timeline-scroll'),content=root.querySelector('.timeline-content');
  const playhead=document.createElement('div');playhead.className='timeline-playhead';playhead.setAttribute('aria-hidden','true');
  let scale=90,extent=5,signature='',drag=null,frame=0,lastScene=-2;
  const round=value=>Number(value.toFixed(4));
  const snap=(value,free)=>free?round(value):round(Math.round(value/.05)*.05);
  function label(time){const units=Math.round(Math.max(0,time)*100),seconds=Math.floor(units/100),fraction=units%100;return seconds<60?`${units/100} s`:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}${fraction?'.'+String(fraction).padStart(2,'0'):''}`;}
  function windowFor(scene,object){
    if(!object)return {start:scene.start,end:scene.end};
    const start=scene.start+Math.min(object.delay,Math.max(0,scene.end-scene.start-.05));
    return {start,end:object.visibleDuration==null?scene.end:Math.min(scene.end,start+object.visibleDuration)};
  }
  function updatePlayhead(time){playhead.style.transform=`translateX(${Math.max(0,time)*scale}px)`;$('timelineCurrent').textContent=label(time);}
  function paintBars(){
    for(const bar of content.querySelectorAll('.timebar')){
      const scene=project.scenes[Number(bar.dataset.scene)],object=bar.dataset.object==null?null:scene?.objects[Number(bar.dataset.object)];if(!scene)continue;
      const span=windowFor(scene,object),length=Math.max(.05,span.end-span.start);
      bar.style.left=span.start*scale+'px';bar.style.width=length*scale+'px';
      bar.querySelector('.timebar-caption').textContent=`${label(span.start)} – ${label(span.end)}`;
      bar.title=object?`${object.type} · ${label(length)} visible · ${label(object.duration)} de entrada${object.visibleDuration==null?' · hasta el final de escena':''}`:`Escena ${Number(bar.dataset.scene)+1} · ${label(length)}`;
      if(object&&object.delay>=scene.end-scene.start)bar.title='Fuera de escena. Mueve su inicio para volver a mostrarlo. '+bar.title;
      bar.classList.toggle('is-hidden',Boolean(object?.hidden));
      bar.classList.toggle('is-outside',Boolean(object&&object.delay>=scene.end-scene.start));
      const entry=bar.querySelector('.timebar-entry');if(entry)entry.style.left=Math.min(length,object.duration)*scale+'px';
      const fill=bar.querySelector('.timebar-entry-fill');if(fill)fill.style.width=Math.min(length,object.duration)*scale+'px';
    }
    updatePlayhead(position);
  }
  function select(sceneIndex,objectIndex){
    setObjectSelection(sceneIndex,objectIndex==null?[]:[objectIndex]);sceneList();
  }
  function makeRow(sceneIndex,objectIndex){
    const scene=project.scenes[sceneIndex],object=objectIndex==null?null:scene.objects[objectIndex];
    const row=document.createElement('div');row.className='timeline-row';
    row.classList.toggle('is-selected',sceneIndex===selectedSceneIndex&&(object?selectionIndices().includes(objectIndex):true));
    const name=document.createElement('button');name.type='button';name.className='timeline-label';
    name.setAttribute('aria-pressed',String(row.classList.contains('is-selected')));
    const description=object?`${objectIndex+1} · ${object.type==='text'?object.text:object.type==='icon'?object.name:object.type}`:`Escena ${sceneIndex+1}`;
    name.textContent=description;name.title=description;
    name.addEventListener('click',()=>{if(exporting||canvasEditor.busy)return;stop();select(sceneIndex,objectIndex);canvasEditor.previewAt(windowFor(scene,object).start);persistUiState();});
    const track=document.createElement('div');track.className='timeline-track';
    const bar=document.createElement('div');bar.className='timebar '+(object?'timebar-object':'timebar-scene');bar.tabIndex=0;bar.setAttribute('role','group');
    bar.setAttribute('aria-label',object?`Tiempo del objeto ${objectIndex+1} de la escena ${sceneIndex+1}`:`Tiempo de escena ${sceneIndex+1}`);
    bar.dataset.scene=sceneIndex;if(object)bar.dataset.object=objectIndex;
    if(object){const fill=document.createElement('span');fill.className='timebar-entry-fill';bar.append(fill);}
    const caption=document.createElement('span');caption.className='timebar-caption';bar.append(caption);
    for(const [mode,title] of [['start','Cambiar inicio'],['end','Cambiar final'],...(object?[['entry','Duración de entrada']]:[])]){
      const handle=document.createElement('button');handle.type='button';handle.className=mode==='entry'?'timebar-entry':'timebar-handle timebar-'+mode;
      handle.dataset.mode=mode;handle.setAttribute('aria-label',`${title} ${object?'del objeto '+(objectIndex+1):'de escena '+(sceneIndex+1)}`);handle.title=handle.getAttribute('aria-label');bar.append(handle);
    }
    bar.addEventListener('pointerdown',event=>start(event,bar));bar.addEventListener('keydown',event=>keyboard(event,bar));
    track.addEventListener('pointerdown',event=>{if(event.target===track)startScrub(event);});
    track.append(bar);row.append(name,track);return row;
  }
  function sync(force=false){
    if(drag)return;
    root.hidden=!project.scenes.length;if(root.hidden){lastScene=-2;return;}
    const state=JSON.stringify([scale,selectedSceneIndex,selectionIndices(),endTime(),project.scenes.map(scene=>[scene.start,scene.end,scene.objects.map(object=>[object.type,object.text,object.name,object.delay,object.visibleDuration,object.duration,object.hidden])])]);
    if(!force&&signature===state){updatePlayhead(position);return;}signature=state;
    const width=Math.max(250,viewport.clientWidth-150);
    extent=Math.max(5,endTime()+Math.max(2,endTime()*.1),width/scale);
    content.style.setProperty('--timeline-width',extent*scale+'px');content.replaceChildren();
    const ruler=document.createElement('div');ruler.className='timeline-row timeline-ruler';
    const heading=document.createElement('span');heading.className='timeline-label';heading.textContent='Escenas';
    const ticks=document.createElement('div');ticks.className='timeline-track';
    const step=[.1,.2,.5,1,2,5,10,15,30,60,120,300,600,1800,3600].find(value=>value*scale>=65)||3600;
    content.style.setProperty('--timeline-grid',step*scale+'px');
    for(let t=0;t<=extent;t+=step){const tick=document.createElement('span');tick.className='timeline-tick';tick.style.left=t*scale+'px';tick.textContent=label(t);ticks.append(tick);}
    ticks.addEventListener('pointerdown',startScrub);ruler.append(heading,ticks);content.append(ruler);
    project.scenes.forEach((scene,sceneIndex)=>{
      content.append(makeRow(sceneIndex,null));
      if(sceneIndex!==selectedSceneIndex)return;
      const heading=document.createElement('div');heading.className='timeline-section';heading.textContent=`Objetos de escena ${selectedSceneIndex+1}`;content.append(heading);
      scene.objects.forEach((_,objectIndex)=>content.append(makeRow(sceneIndex,objectIndex)));
    });
    content.append(playhead);paintBars();
    if(lastScene!==selectedSceneIndex){
      const row=content.querySelector(`.timebar[data-scene="${selectedSceneIndex}"]:not([data-object])`)?.closest('.timeline-row');
      if(row&&(row.offsetTop<viewport.scrollTop+28||row.offsetTop+36>viewport.scrollTop+viewport.clientHeight))viewport.scrollTop=Math.max(0,row.offsetTop-28);
      lastScene=selectedSceneIndex;
    }
  }
  function stateFor(bar,mode){
    const sceneIndex=Number(bar.dataset.scene),objectIndex=bar.dataset.object==null?null:Number(bar.dataset.object);
    return {sceneIndex,objectIndex,mode,kind:objectIndex==null?'scene':'object',original:JSON.stringify(project.scenes[sceneIndex]),base:JSON.stringify(sizeBaseProject.scenes[sceneIndex]),source:JSON.parse(JSON.stringify(project.scenes[sceneIndex])),prior:{scene:selectedSceneIndex,indices:selectionIndices(),primary:selectedObjectIndex},moved:false};
  }
  function start(event,bar){
    if(event.button!==0||!event.isPrimary||exporting||canvasEditor.busy)return;
    event.preventDefault();event.stopPropagation();appearanceEditor.flush();stop();
    drag={...stateFor(bar,event.target.closest('[data-mode]')?.dataset.mode||'move'),pointerId:event.pointerId,startX:event.clientX,scroll:viewport.scrollLeft};
    select(drag.sceneIndex,drag.objectIndex);canvasEditor.previewAt(windowFor(project.scenes[drag.sceneIndex],drag.objectIndex==null?null:project.scenes[drag.sceneIndex].objects[drag.objectIndex]).start);
    viewport.setPointerCapture(event.pointerId);bar.focus({preventScroll:true});
  }
  function applyDelta(delta,free=false){
    const scene=project.scenes[drag.sceneIndex],base=sizeBaseProject.scenes[drag.sceneIndex],source=drag.source,length=source.end-source.start;
    if(drag.kind==='scene'){
      let start=source.start,end=source.end;
      if(drag.mode==='move'){start=clamp(snap(source.start+delta,free),0,10800-length);end=start+length;}
      else if(drag.mode==='start')start=clamp(snap(source.start+delta,free),0,source.end-.05);
      else end=clamp(snap(source.end+delta,free),source.start+.05,10800);
      if(start!==source.start||end!==source.end)drag.moved=true;
      scene.start=base.start=round(start);scene.end=base.end=round(end);
    }else{
      const old=source.objects[drag.objectIndex],object=scene.objects[drag.objectIndex];
      const oldDelay=clamp(old.delay,0,length-.05),oldEnd=old.visibleDuration==null?length:Math.min(length,oldDelay+old.visibleDuration);
      let delay=oldDelay,visible=old.visibleDuration,duration=old.duration;
      if(drag.mode==='move')delay=clamp(snap(oldDelay+delta,free),0,old.visibleDuration==null?length-.05:Math.max(0,length-Math.min(old.visibleDuration,length)));
      else if(drag.mode==='start'){
        delay=clamp(snap(oldDelay+delta,free),0,oldEnd-.05);
        if(visible!=null)visible=oldEnd-delay;
      }else if(drag.mode==='end')visible=clamp(snap(oldEnd+delta,free),delay+.05,length)-delay;
      else if(drag.mode==='entry')duration=clamp(snap(old.duration+delta,free),.05,Math.min(6,visible==null?length-delay:visible));
      if(visible!=null)visible=Math.min(visible,length-delay);
      duration=Math.min(duration,visible==null?length-delay:visible);duration=Math.max(.05,duration);
      const changed=delay!==old.delay||visible!==old.visibleDuration||duration!==old.duration;
      if(changed&&!drag.moved){appearanceEditor.protect(drag.sceneIndex,drag.objectIndex);drag.moved=true;}
      for(const target of [object,base.objects[drag.objectIndex]]){target.delay=round(delay);target.visibleDuration=visible==null?null:round(Math.max(.05,visible));target.duration=round(duration);}
    }
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;preview();});
  }
  function preview(){
    if(!drag||drag.kind==='scrub')return;
    const scene=project.scenes[drag.sceneIndex],object=drag.objectIndex==null?null:scene.objects[drag.objectIndex];
    syncDuration();const span=windowFor(scene,object);canvasEditor.previewAt(Math.min(span.end-.001,span.start+Math.min(.15,(span.end-span.start)/2)));paintBars();
  }
  function finish(event,cancel=false){
    if(!drag||drag.pointerId!==event.pointerId)return;
    const state=drag;drag=null;cancelAnimationFrame(frame);frame=0;
    if(state.kind==='scrub'){if(cancel)canvasEditor.previewAt(state.position);}
    else if(cancel||!state.moved){
      project.scenes[state.sceneIndex]=JSON.parse(state.original);sizeBaseProject.scenes[state.sceneIndex]=JSON.parse(state.base);
      if(cancel)setObjectSelection(state.prior.scene,state.prior.indices,state.prior.primary);
    }
    if(state.pointerId!=null&&viewport.hasPointerCapture(state.pointerId))viewport.releasePointerCapture(state.pointerId);
    if(state.kind!=='scrub'&&state.moved&&!cancel)syncProjectJson();
    signature='';sceneList();seek(position);persistUiState();
    if(state.kind!=='scrub'){
      const selector=`.timebar[data-scene="${state.sceneIndex}"]`+(state.objectIndex==null?':not([data-object])':`[data-object="${state.objectIndex}"]`);
      const bar=content.querySelector(selector),focus=state.mode==='move'?bar:bar?.querySelector(`[data-mode="${state.mode}"]`);
      focus?.focus({preventScroll:true});
    }
  }
  viewport.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    if(drag.kind==='scrub'){scrub(event);return;}
    applyDelta((event.clientX-drag.startX+viewport.scrollLeft-drag.scroll)/scale,event.altKey);
  });
  viewport.addEventListener('pointerup',event=>finish(event));viewport.addEventListener('pointercancel',event=>finish(event,true));viewport.addEventListener('lostpointercapture',event=>finish(event));
  function keyboard(event,bar){
    if(!['ArrowLeft','ArrowRight'].includes(event.key)||exporting||canvasEditor.busy)return;
    event.preventDefault();event.stopPropagation();appearanceEditor.flush();stop();
    const key=event.target.closest('[data-mode]')?.dataset.mode||'move';
    drag={...stateFor(bar,key),pointerId:null};select(drag.sceneIndex,drag.objectIndex);
    applyDelta((event.key==='ArrowRight'?1:-1)*(event.shiftKey?1:.1));preview();finish({pointerId:null});
  }
  function scrub(event){
    const x=event.clientX-content.getBoundingClientRect().left-150;
    canvasEditor.previewAt(clamp(x/scale,0,endTime()));updatePlayhead(position);
  }
  function startScrub(event){
    if(event.button!==0||!event.isPrimary||exporting||canvasEditor.busy)return;
    event.preventDefault();appearanceEditor.flush();stop();drag={kind:'scrub',pointerId:event.pointerId,position};
    viewport.setPointerCapture(event.pointerId);viewport.focus({preventScroll:true});scrub(event);
  }
  viewport.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();finish({pointerId:drag.pointerId},true);}});
  $('timelineZoomOut').addEventListener('click',()=>{if(canvasEditor.busy)return;scale=Math.max(.02,scale/1.5);sync(true);});
  $('timelineZoomIn').addEventListener('click',()=>{if(canvasEditor.busy)return;scale=Math.min(600,scale*1.5);sync(true);});
  $('timelineFit').addEventListener('click',()=>{if(canvasEditor.busy)return;scale=clamp((viewport.clientWidth-150)/Math.max(1,endTime()+1),.02,600);viewport.scrollLeft=0;sync(true);});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>sync(true),100);});
  sync();return {sync,updatePlayhead,get busy(){return Boolean(drag);},get pixelsPerSecond(){return scale;}};
})();
