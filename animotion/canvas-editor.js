'use strict';

// La selección vive en otro canvas: nunca forma parte del video exportado.
var canvasEditor = (() => {
  const overlay = document.createElement('canvas');overlay.className = 'selection-canvas';overlay.setAttribute('aria-hidden','true');
  stage.append(overlay);
  const pen = overlay.getContext('2d');
  const toggle = document.createElement('button');toggle.type = 'button';toggle.className = 'canvas-edit-toggle';toggle.textContent = '✥ Editar objetos';toggle.setAttribute('aria-pressed','false');
  toggle.title = 'Selecciona y arrastra objetos. La esquina cambia su tamaño. En edición se muestran completos, sin movimiento.';
  $('fullscreenPreview').before(toggle);
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label','Vista previa: haz clic para seleccionar y arrastrar objetos; usa las flechas para mover el seleccionado');
  let editing = false, entries = [], drag = null;
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
        const pad=Math.max(...object.shapes.map(s=>s.strokeWidth*size*.58*strokeScale(object)))/2;
        return {x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,width:Math.max(...xs)-Math.min(...xs)+2*pad,height:Math.max(...ys)-Math.min(...ys)+2*pad};
      }
    }
    return {x:-size/2,y:-size/2,width:size,height:size};
  }
  function selectedEntry(){return entries.find(entry=>entry.object===project.scenes[selectedSceneIndex]?.objects[selectedObjectIndex]);}
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
    const entry=selectedEntry();if(!entry)return;
    const pts=corners(entry),unit=1/(dimensions().scale||1);
    pen.strokeStyle='#A9E4D2';pen.lineWidth=1.5*unit;pen.setLineDash([5*unit,3*unit]);
    pen.beginPath();pts.forEach((p,i)=>i?pen.lineTo(p.x,p.y):pen.moveTo(p.x,p.y));pen.closePath();pen.stroke();pen.setLineDash([]);
    const handle=pts[2];pen.fillStyle='#A9E4D2';pen.fillRect(handle.x-5*unit,handle.y-5*unit,10*unit,10*unit);
  }
  function select(entry){
    const sceneIndex=project.scenes.findIndex(scene=>scene.objects.includes(entry.object));
    if(sceneIndex<0)return;
    selectedSceneIndex=sceneIndex;selectedObjectIndex=project.scenes[sceneIndex].objects.indexOf(entry.object);
    sceneList();persistUiState();
  }
  function commit(){
    const object=project.scenes[selectedSceneIndex]?.objects[selectedObjectIndex];
    const base=sizeBaseProject?.scenes[selectedSceneIndex]?.objects[selectedObjectIndex];
    if(!object||!base)return;
    base.x=object.x;base.y=object.y;
    const scale=object.individualStyle?1:object.type==='text'?Number(globalAppearance('textSizeAdjust'))/100:Number(globalAppearance('iconSizeAdjust'))/100;
    base.size=object.size/scale;
    base.width=object.width/(object.individualStyle?1:Number(globalAppearance('iconSizeAdjust'))/100);
    base.height=object.height/(object.individualStyle?1:Number(globalAppearance('iconSizeAdjust'))/100);
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
  toggle.addEventListener('click',()=>{if(exporting)return;if(typeof pencilTool!=='undefined'&&pencilTool.active){pencilTool.deactivate();editing=true;render(position);}else if(editing){editing=false;render(position);}else enable();});
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||exporting||!event.isPrimary)return;
    if(typeof pencilTool!=='undefined'&&pencilTool.active){pencilTool.start(event);return;}
    if(!enabled()&&!enable())return;
    const p=point(event),selected=selectedEntry();
    const handle=selected&&corners(selected)[2],pad=9/(dimensions().scale||1);
    const resizing=handle&&Math.hypot(handle.x-p.x,handle.y-p.y)<=pad;
    const entry=resizing?selected:[...entries].reverse().find(candidate=>{
      const local=candidate.matrix.inverse().transformPoint(p),b=candidate.bounds;
      return local.x>=b.x-pad&&local.x<=b.x+b.width+pad&&local.y>=b.y-pad&&local.y<=b.y+b.height+pad;
    });
    if(!entry){if(typeof appearanceEditor!=='undefined')appearanceEditor.deselect();return;}
    event.preventDefault();select(entry);canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
    const object=entry.object;
    drag={pointerId:event.pointerId,object,start:p,x:object.x,y:object.y,size:object.size,width:object.width,height:object.height,original:JSON.stringify(object),originalBase:JSON.stringify(sizeBaseProject.scenes[selectedSceneIndex].objects[selectedObjectIndex]),moved:false,resizing:Boolean(resizing),distance:Math.max(1,Math.hypot(p.x-object.x*canvas.width,p.y-object.y*canvas.height))};
    render(position);
  });
  canvas.addEventListener('pointermove',event=>{
    if(typeof pencilTool!=='undefined'&&pencilTool.busy){pencilTool.move(event);return;}
    if(!drag||drag.pointerId!==event.pointerId)return;
    const p=point(event),object=drag.object;
    if(!drag.moved&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)<.5)return;
    if(!drag.moved&&typeof appearanceEditor!=='undefined')appearanceEditor.protect(selectedSceneIndex,selectedObjectIndex);
    drag.moved=true;
    if(drag.resizing){
      const ratio=Math.max(.05,Math.hypot(p.x-drag.x*canvas.width,p.y-drag.y*canvas.height)/drag.distance);
      if(object.type==='rect'){object.width=clamp(drag.width*ratio,.01,3);object.height=clamp(drag.height*ratio,.01,3);}
      else if(object.type==='line')object.width=clamp(drag.width*ratio,.01,3);
      else object.size=clamp(drag.size*ratio,1,object.type==='vector'?8192:1200);
    }else{object.x=clamp(drag.x+(p.x-drag.start.x)/canvas.width,-1,2);object.y=clamp(drag.y+(p.y-drag.start.y)/canvas.height,-1,2);}
    syncFields(object);render(position);
  });
  function finish(event,cancel=false){
    if(typeof pencilTool!=='undefined'&&pencilTool.busy){pencilTool.finish(event,cancel);return;}
    if(!drag||drag.pointerId!==event.pointerId)return;
    const state=drag;drag=null;
    if(cancel){Object.assign(state.object,JSON.parse(state.original));sizeBaseProject.scenes[selectedSceneIndex].objects[selectedObjectIndex]=JSON.parse(state.originalBase);}
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(state.moved&&!cancel)commit();
    else{renderSceneEditor(selectedSceneIndex);persistUiState();}
    render(position);
  }
  canvas.addEventListener('pointerup',event=>finish(event));
  canvas.addEventListener('pointercancel',event=>finish(event,true));
  canvas.addEventListener('lostpointercapture',event=>finish(event));
  canvas.addEventListener('keydown',event=>{
    if(!enabled())return;
    if(event.key==='Escape'){
      if(typeof pencilTool!=='undefined'&&pencilTool.active){pencilTool.escape();event.preventDefault();return;}
      if(drag)finish({pointerId:drag.pointerId},true);
      else if(selectedObjectIndex>=0&&typeof appearanceEditor!=='undefined')appearanceEditor.deselect();
      else{editing=false;render(position);}event.preventDefault();return;
    }
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    const object=project.scenes[selectedSceneIndex]?.objects[selectedObjectIndex];if(!object)return;
    if(typeof appearanceEditor!=='undefined')appearanceEditor.protect(selectedSceneIndex,selectedObjectIndex);
    event.preventDefault();const step=event.shiftKey?10:1;
    object.x=clamp(object.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0)/canvas.width,-1,2);
    object.y=clamp(object.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)/canvas.height,-1,2);
    commit();render(position);
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Backspace'||event.repeat||event.ctrlKey||event.metaKey||event.altKey||!enabled()||drag||(typeof pencilTool!=='undefined'&&pencilTool.active))return;
    if(event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])'))return;
    if(!project.scenes[selectedSceneIndex]?.objects[selectedObjectIndex])return;
    event.preventDefault();toggleObjectVisibility(selectedSceneIndex,selectedObjectIndex);
  });
  return {get editing(){return editing;},get busy(){return Boolean(drag)||(typeof pencilTool!=='undefined'&&pencilTool.busy);},selectionBounds(){const entry=selectedEntry();if(!entry)return null;const points=corners(entry);return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};},enableDrawing(){stop();editing=true;render(position);},activateScene(index){if(exporting)return;stop();editing=true;if(typeof pencilTool!=='undefined')pencilTool.deactivate();seek(project.scenes[index].start);},begin(){entries=[];},record(object,box,matrix){entries.push({object,bounds:box||bounds(object),matrix});},paint};
})();
render(position);
