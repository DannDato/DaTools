'use strict';

// La selección vive en otro canvas: nunca forma parte del video exportado.
var canvasEditor = (() => {
  const overlay = document.createElement('canvas');overlay.className = 'selection-canvas';overlay.setAttribute('aria-hidden','true');
  stage.append(overlay);
  const pen = overlay.getContext('2d');
  const toggle = document.createElement('button');toggle.type = 'button';toggle.className = 'canvas-edit-toggle';toggle.textContent = '✥ Editar objetos';toggle.setAttribute('aria-pressed','false');
  toggle.title = 'Arrastra sobre un espacio vacío para seleccionar con un recuadro. Shift añade a la selección. Arrastra objetos para moverlos.';
  $('fullscreenPreview').before(toggle);
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label','Vista previa: arrastra un espacio vacío para seleccionar con un recuadro; Shift añade objetos; arrastra un objeto para mover la selección');
  let editing = false, entries = [], drag = null, marquee = null;
  const enabled = () => editing && !playing && !exporting;
  function dimensions() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width/canvas.width,rect.height/canvas.height);
    return {scale,left:rect.left+(rect.width-canvas.width*scale)/2,top:rect.top+(rect.height-canvas.height*scale)/2};
  }
  function point(event) { const view=dimensions();return {x:(event.clientX-view.left)/view.scale,y:(event.clientY-view.top)/view.scale}; }
  function bounds(object) {
    const size=object.size*canvas.width/2560;
    if(object.type==='rect')return {x:-object.width*canvas.width/2,y:-object.height*canvas.height/2,width:object.width*canvas.width,height:object.height*canvas.height};
    if(object.type==='line')return {x:-object.width*canvas.width/2,y:-Math.max(size*.035*strokeScale(object),2)/2,width:object.width*canvas.width,height:Math.max(size*.035*strokeScale(object),2)};
    if(object.type==='vector'&&object.shapes.length){
      const points=[];
      for(const shape of object.shapes){
        if(shape.kind==='circle')points.push([shape.x-shape.r,shape.y-shape.r],[shape.x+shape.r,shape.y+shape.r]);
        else if(shape.kind==='rect')points.push([shape.x-shape.width/2,shape.y-shape.height/2],[shape.x+shape.width/2,shape.y+shape.height/2]);
        else for(const p of shape.points)points.push([p.x,p.y]);
      }
      if(points.length){
        const xs=points.map(p=>p[0]*size/2),ys=points.map(p=>p[1]*size/2);
        const pad=Math.max(...object.shapes.map(s=>s.strokeWidth*size*.58*strokeScale(object)*(s.lineJoin==='miter'?2:.5)));
        return {x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,width:Math.max(...xs)-Math.min(...xs)+2*pad,height:Math.max(...ys)-Math.min(...ys)+2*pad};
      }
    }
    return {x:-size/2,y:-size/2,width:size,height:size};
  }
  function selectedEntry(){return entries.find(entry=>entry.object===project.scenes[selectedSceneIndex]?.objects[selectedObjectIndex]);}
  function selectedEntries(){const objects=selectionIndices().map(index=>project.scenes[selectedSceneIndex].objects[index]);return entries.filter(entry=>objects.includes(entry.object));}
  function selectionBounds(){const points=selectedEntries().flatMap(corners);return points.length?{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}:null;}
  function corners(entry){
    const b=entry.bounds;
    return [[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]].map(([x,y])=>entry.matrix.transformPoint({x,y}));
  }
  function paint(){
    if(overlay.width!==canvas.width)overlay.width=canvas.width;
    if(overlay.height!==canvas.height)overlay.height=canvas.height;
    pen.clearRect(0,0,overlay.width,overlay.height);
    stage.classList.toggle('is-editing',enabled());toggle.setAttribute('aria-pressed',String(editing));
    if(!enabled())return;
    if(typeof pencilTool!=='undefined'&&pencilTool.active){pencilTool.paint(pen);return;}
    const unit=1/(dimensions().scale||1);
    if(marquee?.moved){
      const box=marqueeBox();pen.fillStyle='rgba(169,228,210,.12)';pen.strokeStyle='#A9E4D2';pen.lineWidth=unit;pen.setLineDash([]);
      pen.fillRect(box.left,box.top,box.right-box.left,box.bottom-box.top);pen.strokeRect(box.left,box.top,box.right-box.left,box.bottom-box.top);
    }
    const selected=selectedEntries();if(!selected.length)return;
    pen.strokeStyle='#A9E4D2';pen.lineWidth=1.5*unit;pen.setLineDash([5*unit,3*unit]);
    for(const entry of selected){const pts=corners(entry);pen.beginPath();pts.forEach((p,i)=>i?pen.lineTo(p.x,p.y):pen.moveTo(p.x,p.y));pen.closePath();pen.stroke();}
    pen.setLineDash([]);
    if(selectionIndices().length===1&&!marquee){const handle=corners(selected[0])[2];pen.fillStyle='#A9E4D2';pen.fillRect(handle.x-5*unit,handle.y-5*unit,10*unit,10*unit);}
    else{const box=selectionBounds();pen.strokeRect(box.left-4*unit,box.top-4*unit,box.right-box.left+8*unit,box.bottom-box.top+8*unit);}
  }
  function select(entry,shift=false){
    const sceneIndex=project.scenes.findIndex(scene=>scene.objects.includes(entry.object));
    if(sceneIndex<0)return;
    const index=project.scenes[sceneIndex].objects.indexOf(entry.object);
    if(shift)toggleObjectSelection(sceneIndex,index);
    else if(sceneIndex!==selectedSceneIndex||!selectionIndices().includes(index))setObjectSelection(sceneIndex,[index]);
    else selectedObjectIndex=index;
    sceneList();persistUiState();
  }
  function commit(){
    for(const index of selectionIndices()){
    const object=project.scenes[selectedSceneIndex]?.objects[index];
    const base=sizeBaseProject?.scenes[selectedSceneIndex]?.objects[index];
    if(!object||!base)continue;
    base.x=object.x;base.y=object.y;
    const scale=object.individualStyle?1:object.type==='text'?Number(globalAppearance('textSizeAdjust'))/100:Number(globalAppearance('iconSizeAdjust'))/100;
    base.size=object.size/scale;
    base.width=object.width/(object.individualStyle?1:Number(globalAppearance('iconSizeAdjust'))/100);
    base.height=object.height/(object.individualStyle?1:Number(globalAppearance('iconSizeAdjust'))/100);
    }
    syncProjectJson();renderSceneEditor(selectedSceneIndex);persistUiState();
  }
  function syncFields(object){
    const values={'X (0–1)':object.x,'Y (0–1)':object.y,'Tamaño':object.size,'Ancho (0–3× lienzo)':object.width,'Alto (0–3× lienzo)':object.height,'Longitud (0–3× lienzo)':object.width};
    for(const label of $('sceneEditor').querySelectorAll('.scene-object-editor label')){
      if(Object.hasOwn(values,label.textContent))$(label.htmlFor).value=String(Number(values[label.textContent].toFixed(5)));
    }
  }
  function enable(){
    if(!project.scenes.length||exporting)return false;
    stop();editing=true;
    if(!project.scenes.some(scene=>position>=scene.start&&position<scene.end))seek(project.scenes[Math.max(0,selectedSceneIndex)]?.start||project.scenes[0].start);
    render(position);return true;
  }
  function marqueeBox(){return {left:Math.min(marquee.start.x,marquee.end.x),right:Math.max(marquee.start.x,marquee.end.x),top:Math.min(marquee.start.y,marquee.end.y),bottom:Math.max(marquee.start.y,marquee.end.y)};}
  function startMarquee(event,p){
    const prior={scene:selectedSceneIndex,indices:selectionIndices(),primary:selectedObjectIndex};
    const selectedScene=project.scenes[selectedSceneIndex];
    const scene=selectedScene&&position>=selectedScene.start&&position<selectedScene.end?selectedSceneIndex:project.scenes.findLastIndex(item=>position>=item.start&&position<item.end);
    if(scene<0)return;
    const indices=new Map(project.scenes[scene].objects.map((object,index)=>[object,index]));
    const candidates=entries.filter(entry=>indices.has(entry.object)).map(entry=>({index:indices.get(entry.object),points:corners(entry)}));
    marquee={pointerId:event.pointerId,start:p,end:p,scene,prior,additive:event.shiftKey,moved:false,candidates};
    if(!event.shiftKey)setObjectSelection(scene,[]);
    event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);paint();
  }
  function moveMarquee(event){
    if(!marquee||marquee.pointerId!==event.pointerId)return;
    const p=point(event);marquee.end={x:clamp(p.x,0,canvas.width),y:clamp(p.y,0,canvas.height)};
    if(!marquee.moved&&Math.hypot(p.x-marquee.start.x,p.y-marquee.start.y)*(dimensions().scale||1)<3)return;
    marquee.moved=true;
    const box=marqueeBox();
    const hits=marquee.candidates.filter(candidate=>candidate.points.every(p=>p.x>=box.left-1&&p.x<=box.right+1&&p.y>=box.top-1&&p.y<=box.bottom+1)).map(candidate=>candidate.index);
    const existing=marquee.additive&&marquee.prior.scene===marquee.scene?marquee.prior.indices:[];
    setObjectSelection(marquee.scene,[...existing,...hits]);paint();
  }
  function finishMarquee(event,cancel){
    if(!marquee||marquee.pointerId!==event.pointerId)return;
    const state=marquee;marquee=null;
    if(cancel||(!state.moved&&state.additive))setObjectSelection(state.prior.scene,state.prior.indices,state.prior.primary);
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    sceneList();render(position);persistUiState();
  }
  toggle.addEventListener('click',()=>{if(exporting)return;if(typeof pencilTool!=='undefined'&&pencilTool.active){pencilTool.deactivate();editing=true;render(position);}else if(editing){editing=false;render(position);}else enable();});
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||exporting||!event.isPrimary)return;
    if(typeof pencilTool!=='undefined'&&pencilTool.active){pencilTool.start(event);return;}
    if(!enabled()&&!enable())return;
    const p=point(event),selected=selectedEntry();
    const handle=selectionIndices().length===1&&selected&&corners(selected)[2],pad=9/(dimensions().scale||1);
    const resizing=handle&&Math.hypot(handle.x-p.x,handle.y-p.y)<=pad;
    const entry=resizing?selected:[...entries].reverse().find(candidate=>{
      const local=candidate.matrix.inverse().transformPoint(p),b=candidate.bounds;
      return local.x>=b.x-pad&&local.x<=b.x+b.width+pad&&local.y>=b.y-pad&&local.y<=b.y+b.height+pad;
    });
    if(!entry){startMarquee(event,p);return;}
    event.preventDefault();select(entry,event.shiftKey);canvas.focus({preventScroll:true});
    if(event.shiftKey){render(position);return;}
    canvas.setPointerCapture(event.pointerId);
    const object=entry.object;
    drag={pointerId:event.pointerId,object,start:p,x:object.x,y:object.y,size:object.size,width:object.width,height:object.height,original:JSON.stringify(object),originalBase:JSON.stringify(sizeBaseProject.scenes[selectedSceneIndex].objects[selectedObjectIndex]),moved:false,resizing:Boolean(resizing),distance:Math.max(1,Math.hypot(p.x-object.x*canvas.width,p.y-object.y*canvas.height))};
    drag.members=selectionIndices().map(index=>({index,object:project.scenes[selectedSceneIndex].objects[index],original:JSON.stringify(project.scenes[selectedSceneIndex].objects[index]),originalBase:JSON.stringify(sizeBaseProject.scenes[selectedSceneIndex].objects[index]),x:project.scenes[selectedSceneIndex].objects[index].x,y:project.scenes[selectedSceneIndex].objects[index].y}));
    render(position);
  });
  canvas.addEventListener('pointermove',event=>{
    if(marquee){moveMarquee(event);return;}
    if(typeof pencilTool!=='undefined'&&pencilTool.busy){pencilTool.move(event);return;}
    if(!drag||drag.pointerId!==event.pointerId)return;
    const p=point(event),object=drag.object;
    if(!drag.moved&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)<.5)return;
    if(!drag.moved&&typeof appearanceEditor!=='undefined')for(const member of drag.members)appearanceEditor.protect(selectedSceneIndex,member.index);
    drag.moved=true;
    if(drag.resizing){
      const ratio=Math.max(.05,Math.hypot(p.x-drag.x*canvas.width,p.y-drag.y*canvas.height)/drag.distance);
      if(object.type==='rect'){object.width=clamp(drag.width*ratio,.01,3);object.height=clamp(drag.height*ratio,.01,3);}
      else if(object.type==='line')object.width=clamp(drag.width*ratio,.01,3);
      else object.size=clamp(drag.size*ratio,1,object.type==='vector'?8192:1200);
    }else{
      const dx=clamp((p.x-drag.start.x)/canvas.width,Math.max(...drag.members.map(m=>-1-m.x)),Math.min(...drag.members.map(m=>2-m.x)));
      const dy=clamp((p.y-drag.start.y)/canvas.height,Math.max(...drag.members.map(m=>-1-m.y)),Math.min(...drag.members.map(m=>2-m.y)));
      for(const member of drag.members){member.object.x=member.x+dx;member.object.y=member.y+dy;}
    }
    syncFields(object);render(position);
  });
  function finish(event,cancel=false){
    if(marquee){finishMarquee(event,cancel);return;}
    if(typeof pencilTool!=='undefined'&&pencilTool.busy){pencilTool.finish(event,cancel);return;}
    if(!drag||drag.pointerId!==event.pointerId)return;
    const state=drag;drag=null;
    if(cancel)for(const member of state.members){Object.assign(member.object,JSON.parse(member.original));sizeBaseProject.scenes[selectedSceneIndex].objects[member.index]=JSON.parse(member.originalBase);}
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(state.moved&&!cancel)commit();
    else{if(!cancel&&selectionIndices().length>1)setObjectSelection(selectedSceneIndex,[selectedObjectIndex]);renderSceneEditor(selectedSceneIndex);persistUiState();}
    render(position);
  }
  canvas.addEventListener('pointerup',event=>finish(event));
  canvas.addEventListener('pointercancel',event=>finish(event,true));
  canvas.addEventListener('lostpointercapture',event=>finish(event));
  canvas.addEventListener('keydown',event=>{
    if(!enabled())return;
    if(event.key==='Escape'){
      if(typeof pencilTool!=='undefined'&&pencilTool.active){pencilTool.escape();event.preventDefault();return;}
      if(marquee)finishMarquee({pointerId:marquee.pointerId},true);
      else if(drag)finish({pointerId:drag.pointerId},true);
      else if(selectedObjectIndex>=0&&typeof appearanceEditor!=='undefined')appearanceEditor.deselect();
      else{editing=false;render(position);}event.preventDefault();return;
    }
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    if(marquee){event.preventDefault();return;}
    const object=project.scenes[selectedSceneIndex]?.objects[selectedObjectIndex];if(!object)return;
    for(const index of selectionIndices())if(typeof appearanceEditor!=='undefined')appearanceEditor.protect(selectedSceneIndex,index);
    event.preventDefault();const step=event.shiftKey?10:1;
    const objects=selectionIndices().map(index=>project.scenes[selectedSceneIndex].objects[index]);
    const dx=clamp((event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0)/canvas.width,Math.max(...objects.map(o=>-1-o.x)),Math.min(...objects.map(o=>2-o.x)));
    const dy=clamp((event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)/canvas.height,Math.max(...objects.map(o=>-1-o.y)),Math.min(...objects.map(o=>2-o.y)));
    for(const item of objects){item.x+=dx;item.y+=dy;}
    commit();render(position);
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Backspace'||event.repeat||event.ctrlKey||event.metaKey||event.altKey||!enabled()||drag||marquee||(typeof pencilTool!=='undefined'&&pencilTool.active))return;
    if(event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])'))return;
    if(!project.scenes[selectedSceneIndex]?.objects[selectedObjectIndex])return;
    event.preventDefault();
    const indices=selectionIndices(),hidden=!indices.every(index=>project.scenes[selectedSceneIndex].objects[index].hidden);
    for(const index of indices){project.scenes[selectedSceneIndex].objects[index].hidden=hidden;sizeBaseProject.scenes[selectedSceneIndex].objects[index].hidden=hidden;}
    syncProjectJson();sceneList();render(position);persistUiState();
  });
  return {get editing(){return editing;},get busy(){return Boolean(drag||marquee)||(typeof pencilTool!=='undefined'&&pencilTool.busy)||(typeof timelineEditor!=='undefined'&&timelineEditor.busy);},selectionBounds,previewAt(time){stop();editing=false;if(typeof pencilTool!=='undefined'&&pencilTool.active)pencilTool.deactivate();seek(time);},enableDrawing(){stop();editing=true;render(position);},activateScene(index){if(exporting)return;stop();editing=true;if(typeof pencilTool!=='undefined')pencilTool.deactivate();seek(project.scenes[index].start);},begin(){entries=[];},record(object,box,matrix){entries.push({object,bounds:box||bounds(object),matrix});},paint};
})();
render(position);
