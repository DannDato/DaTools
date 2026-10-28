'use strict';

var objectTools = (() => {
  const box=document.createElement('div');box.className='object-tools';box.hidden=true;
  box.innerHTML='<strong>Objeto seleccionado</strong><button type="button" id="duplicateObject">⧉ Duplicar objeto</button><div class="object-tools-row object-order"></div><div class="object-tools-row object-align"></div>';
  document.querySelector('.appearance-scope').after(box);
  const buttons=new Map();
  const selected=()=>project.scenes[selectedSceneIndex]?.objects[selectedObjectIndex];
  function finish(){syncProjectJson();sceneList();render(position);persistUiState();}
  function duplicate(){
    if(!selected()||exporting||canvasEditor.busy)return;
    const scene=project.scenes[selectedSceneIndex],base=sizeBaseProject.scenes[selectedSceneIndex];
    const copies=[];
    for(const index of selectionIndices().sort((a,b)=>a-b)){
    const copy=JSON.parse(JSON.stringify(scene.objects[index])),source=JSON.parse(JSON.stringify(base.objects[index]));
    copy.x=source.x=clamp(copy.x+(copy.x>.95?-.025:.025),-1,2);
    copy.y=source.y=clamp(copy.y+(copy.y>.95?-.025:.025),-1,2);copy.hidden=source.hidden=false;
    scene.objects.push(copy);base.objects.push(source);copies.push(scene.objects.length-1);
    appearanceEditor.protect(selectedSceneIndex,scene.objects.length-1);
    }
    setObjectSelection(selectedSceneIndex,copies);canvasEditor.activateScene(selectedSceneIndex);finish();
  }
  function order(action){
    if(!selected()||exporting||canvasEditor.busy)return;
    const scene=project.scenes[selectedSceneIndex],base=sizeBaseProject.scenes[selectedSceneIndex],primary=selected();
    const selectedObjects=new Set(selectionIndices().map(index=>scene.objects[index]));
    let order=scene.objects.map((_,index)=>index);
    if(action==='front')order=[...order.filter(i=>!selectedObjects.has(scene.objects[i])),...order.filter(i=>selectedObjects.has(scene.objects[i]))];
    else if(action==='back')order=[...order.filter(i=>selectedObjects.has(scene.objects[i])),...order.filter(i=>!selectedObjects.has(scene.objects[i]))];
    else if(action==='forward')for(let i=order.length-2;i>=0;i--){if(selectedObjects.has(scene.objects[order[i]])&&!selectedObjects.has(scene.objects[order[i+1]]))[order[i],order[i+1]]=[order[i+1],order[i]];}
    else if(action==='backward')for(let i=1;i<order.length;i++){if(selectedObjects.has(scene.objects[order[i]])&&!selectedObjects.has(scene.objects[order[i-1]]))[order[i],order[i-1]]=[order[i-1],order[i]];}
    if(order.every((index,i)=>index===i))return;
    scene.objects=order.map(index=>scene.objects[index]);base.objects=order.map(index=>base.objects[index]);
    setObjectSelection(selectedSceneIndex,scene.objects.flatMap((object,index)=>selectedObjects.has(object)?[index]:[]),scene.objects.indexOf(primary));
    finish();
  }
  function align(action){
    const object=selected();if(!object||exporting||canvasEditor.busy)return;
    canvasEditor.activateScene(selectedSceneIndex);
    const rect=canvasEditor.selectionBounds();if(!rect)return;
    const margin=Math.min(canvas.width,canvas.height)*.055;
    const dx=action==='left'?margin-rect.left:action==='right'?canvas.width-margin-rect.right:action==='centerX'?canvas.width/2-(rect.left+rect.right)/2:0;
    const dy=action==='top'?margin-rect.top:action==='bottom'?canvas.height-margin-rect.bottom:action==='centerY'?canvas.height/2-(rect.top+rect.bottom)/2:0;
    for(const index of selectionIndices()){
      const object=project.scenes[selectedSceneIndex].objects[index];appearanceEditor.protect(selectedSceneIndex,index);
      object.x=clamp(object.x+dx/canvas.width,-1,2);object.y=clamp(object.y+dy/canvas.height,-1,2);
      const base=sizeBaseProject.scenes[selectedSceneIndex].objects[index];base.x=object.x;base.y=object.y;
    }
    finish();
  }
  function add(parent,key,label,title,handler){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.title=title;button.dataset.objectAction=key;
    button.setAttribute('aria-label',title);button.addEventListener('click',()=>handler(key));parent.append(button);buttons.set(key,button);
  }
  for(const [key,label,title] of [['forward','↑ Adelante','Subir una capa'],['backward','↓ Atrás','Bajar una capa'],['front','⇈ Frente','Traer al frente'],['back','⇊ Fondo','Enviar al fondo']])add(box.querySelector('.object-order'),key,label,title,order);
  for(const [key,label,title] of [['left','Izquierda','Alinear a la izquierda'],['centerX','Centro H','Centrar horizontalmente'],['right','Derecha','Alinear a la derecha'],['top','Arriba','Alinear arriba'],['centerY','Centro V','Centrar verticalmente'],['bottom','Abajo','Alinear abajo']])add(box.querySelector('.object-align'),key,label,title,align);
  $('duplicateObject').addEventListener('click',duplicate);
  function sync(){
    const object=selected();box.hidden=!object;if(!object)return;
    const last=project.scenes[selectedSceneIndex].objects.length-1;
    const indices=selectionIndices(),set=new Set(indices),objects=indices.map(index=>project.scenes[selectedSceneIndex].objects[index]);
    box.querySelector('strong').textContent=indices.length>1?'Objetos seleccionados':'Objeto seleccionado';$('duplicateObject').textContent=indices.length>1?'⧉ Duplicar selección':'⧉ Duplicar objeto';
    for(const [key,button] of buttons)button.disabled=exporting||(key==='forward'||key==='front'?!indices.some(i=>i<last&&!set.has(i+1)):key==='backward'||key==='back'?!indices.some(i=>i>0&&!set.has(i-1)):objects.every(item=>item.hidden));
  }
  sync();return {sync,duplicate,order,align};
})();
