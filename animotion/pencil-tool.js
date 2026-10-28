'use strict';

var pencilTool = (() => {
  const button=document.createElement('button');button.id='pencilTool';button.type='button';button.className='canvas-edit-toggle';
  button.textContent='✎ Lápiz';button.setAttribute('aria-pressed','false');button.title='Cada trazo crea un objeto vectorial. Esc cancela el trazo o vuelve a seleccionar.';
  document.querySelector('.canvas-edit-toggle').after(button);
  const options=document.createElement('div');options.className='pencil-options';options.hidden=true;
  options.innerHTML='<label for="pencilColor">Color</label><input id="pencilColor" type="color" aria-label="Color del lápiz"><label for="pencilWidth">Grosor</label><input id="pencilWidth" type="range" min="1" max="24" value="6" aria-label="Grosor del lápiz"><output id="pencilWidthValue" for="pencilWidth">6</output>';
  stage.before(options);$('pencilColor').value=$('fg').value;
  $('pencilWidth').addEventListener('input',()=>{$('pencilWidthValue').value=$('pencilWidth').value;});
  let active=false,stroke=null;
  function view(){
    const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/canvas.width,r.height/canvas.height);
    return {scale,left:r.left+(r.width-canvas.width*scale)/2,top:r.top+(r.height-canvas.height*scale)/2};
  }
  function point(event){const v=view();return {x:clamp((event.clientX-v.left)/v.scale,0,canvas.width),y:clamp((event.clientY-v.top)/v.scale,0,canvas.height)};}
  function ui(){button.setAttribute('aria-pressed',String(active));options.hidden=!active;stage.classList.toggle('is-drawing',active&&!playing&&!exporting);}
  function deactivate(){
    if(stroke)finish({pointerId:stroke.pointerId},true);
    active=false;ui();render(position);
  }
  button.addEventListener('click',()=>{
    if(exporting||canvasEditor.busy)return;
    if(active){deactivate();return;}
    active=true;
    if(selectedSceneIndex>=0&&project.scenes[selectedSceneIndex])seek(project.scenes[selectedSceneIndex].start);
    else if(project.scenes.length&&!project.scenes.some(scene=>position>=scene.start&&position<scene.end))seek(project.scenes[0].start);
    canvasEditor.enableDrawing();ui();
  });
  function start(event){
    if(exporting||stroke)return;
    event.preventDefault();canvasEditor.enableDrawing();canvas.focus({preventScroll:true});
    const selected=project.scenes[selectedSceneIndex];
    const sceneIndex=selected&&position>=selected.start&&position<selected.end?selectedSceneIndex:project.scenes.findLastIndex(scene=>position>=scene.start&&position<scene.end);
    stroke={pointerId:event.pointerId,points:[point(event)],sceneIndex,color:$('pencilColor').value,width:Number($('pencilWidth').value)};
    canvas.setPointerCapture(event.pointerId);render(position);
  }
  function move(event){
    if(!stroke||stroke.pointerId!==event.pointerId)return;
    const events=event.getCoalescedEvents?.();
    for(const sample of events?.length?events:[event]){
      const p=point(sample),last=stroke.points.at(-1);
      if(Math.hypot(p.x-last.x,p.y-last.y)*(view().scale||1)<.75)continue;
      if(stroke.points.length>=4096)stroke.points=stroke.points.filter((_,i)=>i%2===0);
      stroke.points.push(p);
    }
    render(position);
  }
  // Douglas-Peucker iterativo: conserva el gesto con menos puntos y JSON más pequeño.
  function simplify(points,tolerance){
    if(points.length<3)return points;
    const kept=new Set([0,points.length-1]),pending=[[0,points.length-1]],limit=tolerance*tolerance;
    while(pending.length){
      const [first,last]=pending.pop(),a=points[first],b=points[last],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
      let maximum=limit,index=-1;
      for(let i=first+1;i<last;i++){
        const p=points[i],t=length?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length,0,1):0;
        const distance=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
        if(distance>maximum){maximum=distance;index=i;}
      }
      if(index>=0){kept.add(index);pending.push([first,index],[index,last]);}
    }
    return [...kept].sort((a,b)=>a-b).map(i=>points[i]);
  }
  function finish(event,cancel=false){
    if(!stroke||stroke.pointerId!==event.pointerId)return;
    const drawing=stroke;stroke=null;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(cancel||drawing.points.length<2){render(position);return;}
    const points=simplify(drawing.points,.65/(view().scale||1));
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    const factor=canvas.width/2560,size=Math.max(16,Math.max(right-left,bottom-top)/factor),unit=size*factor/2,cx=(left+right)/2,cy=(top+bottom)/2;
    let scene=project.scenes[drawing.sceneIndex];
    const length=scene?scene.end-scene.start:5;
    const raw={type:'vector',individualStyle:true,strokeMultiplier:strokeScale(),x:cx/canvas.width,y:cy/canvas.height,size,color:drawing.color,enter:'draw',idle:'none',delay:0,duration:Math.min(1.2,length*.6),shapes:[{kind:'path',points:points.map(p=>({x:Number(((p.x-cx)/unit).toFixed(5)),y:Number(((p.y-cy)/unit).toFixed(5))})),strokeWidth:clamp(drawing.width/(size*.58),.0001,.25),fill:false,closed:false}]};
    const object=validate({scenes:[{start:0,end:Math.max(.05,length),objects:[raw]}]}).scenes[0].objects[0];
    if(!scene){
      if(project.scenes.length)return;
      project=validate({resolution:[canvas.width,canvas.height],fps:Number($('fps').value),scenes:[{start:0,end:5,objects:[object]}]});
      sizeBaseProject=JSON.parse(JSON.stringify(project));selectedSceneIndex=0;selectedObjectIndex=0;
    }else{
      selectedSceneIndex=drawing.sceneIndex;selectedObjectIndex=scene.objects.length;scene.objects.push(object);
      sizeBaseProject.scenes[selectedSceneIndex].objects.push(JSON.parse(JSON.stringify(object)));
    }
    setObjectSelection(selectedSceneIndex,[selectedObjectIndex]);
    syncProjectJson();sceneList();seek(project.scenes[selectedSceneIndex].start);persistUiState();
  }
  function paint(pen){
    ui();if(!stroke)return;
    pen.save();pen.strokeStyle=stroke.color;pen.lineWidth=stroke.width*canvas.width/2560*strokeScale();pen.lineCap='round';pen.lineJoin='round';pen.setLineDash([]);pen.beginPath();
    stroke.points.forEach((p,i)=>i?pen.lineTo(p.x,p.y):pen.moveTo(p.x,p.y));pen.stroke();pen.restore();
  }
  function escape(){if(stroke)finish({pointerId:stroke.pointerId},true);else deactivate();}
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&active&&!event.defaultPrevented&&!event.target.closest('input,textarea,select,[contenteditable]')){event.preventDefault();escape();}
  });
  return {get active(){return active;},get busy(){return Boolean(stroke);},start,move,finish,paint,deactivate,escape};
})();
