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
    const copy=JSON.parse(JSON.stringify(selected())),source=JSON.parse(JSON.stringify(base.objects[selectedObjectIndex]));
    copy.x=source.x=clamp(copy.x+(copy.x>.95?-.025:.025),-1,2);
    copy.y=source.y=clamp(copy.y+(copy.y>.95?-.025:.025),-1,2);copy.hidden=source.hidden=false;
    scene.objects.push(copy);base.objects.push(source);selectedObjectIndex=scene.objects.length-1;
    appearanceEditor.protect(selectedSceneIndex,selectedObjectIndex);canvasEditor.activateScene(selectedSceneIndex);finish();
  }
  function order(action){
    if(!selected()||exporting||canvasEditor.busy)return;
    const scene=project.scenes[selectedSceneIndex],base=sizeBaseProject.scenes[selectedSceneIndex],from=selectedObjectIndex;
    const to=action==='front'?scene.objects.length-1:action==='back'?0:clamp(from+(action==='forward'?1:-1),0,scene.objects.length-1);
    if(to===from)return;
    scene.objects.splice(to,0,scene.objects.splice(from,1)[0]);
    base.objects.splice(to,0,base.objects.splice(from,1)[0]);selectedObjectIndex=to;
    finish();
  }
  function align(action){
    const object=selected();if(!object||object.hidden||exporting||canvasEditor.busy)return;
    canvasEditor.activateScene(selectedSceneIndex);
    const rect=canvasEditor.selectionBounds();if(!rect)return;
    appearanceEditor.protect(selectedSceneIndex,selectedObjectIndex);
    const margin=Math.min(canvas.width,canvas.height)*.055;
    const dx=action==='left'?margin-rect.left:action==='right'?canvas.width-margin-rect.right:action==='centerX'?canvas.width/2-(rect.left+rect.right)/2:0;
    const dy=action==='top'?margin-rect.top:action==='bottom'?canvas.height-margin-rect.bottom:action==='centerY'?canvas.height/2-(rect.top+rect.bottom)/2:0;
    object.x=clamp(object.x+dx/canvas.width,-1,2);object.y=clamp(object.y+dy/canvas.height,-1,2);
    const base=sizeBaseProject.scenes[selectedSceneIndex].objects[selectedObjectIndex];base.x=object.x;base.y=object.y;
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
    for(const [key,button] of buttons)button.disabled=exporting||(key==='forward'||key==='front'?selectedObjectIndex===last:key==='backward'||key==='back'?selectedObjectIndex===0:object.hidden);
  }
  sync();return {sync,duplicate,order,align};
})();
