'use strict';

var appearanceEditor = (() => {
  const ids=['fg','accent','elementColor2','vectorColor','fontFamily','textSizeAdjust','iconSizeAdjust','strokeAdjust'];
  const colors=['fg','accent','elementColor2','vectorColor'];
  appearanceGlobals=Object.fromEntries(ids.map(id=>[id,$(id).value]));
  const scope=document.createElement('div');scope.className='appearance-scope';
  scope.innerHTML='<strong id="appearanceScope">Todas las escenas</strong><div><button type="button" id="deselectObject">Deseleccionar</button><button type="button" id="inheritAppearance">Usar globales</button></div>';
  const selectedColor=document.createElement('div');selectedColor.className='selected-object-color';selectedColor.hidden=true;
  selectedColor.innerHTML='<label for="selectedObjectColor">Color del objeto</label><input id="selectedObjectColor" type="color" aria-label="Color del objeto"><output id="selectedObjectColorValue" for="selectedObjectColor"></output>';
  scope.append(selectedColor);
  scope.title='Los objetos editados individualmente quedan protegidos. Fondo, formato y FPS siempre afectan al proyecto completo.';
  document.querySelector('.dock-appearance .dock-content').prepend(scope);
  const selected=()=>project.scenes[selectedSceneIndex]?.objects[selectedObjectIndex];
  let pending=false,frame=0,saveTimer=0;
  const hasStroke=object=>['vector','line'].includes(object.type)||(object.type==='icon'&&!iconData[object.name]);
  const hide=(node,hidden)=>{if(node)node.hidden=hidden;};
  function protect(sceneIndex,objectIndex){
    const object=project.scenes[sceneIndex]?.objects[objectIndex],base=sizeBaseProject?.scenes[sceneIndex]?.objects[objectIndex];
    if(!object||!base||object.individualStyle)return;
    const original={size:base.size,width:base.width,height:base.height,color:base.color,strokes:base.shapes.map(shape=>shape.strokeWidth)};
    for(const target of [object,base]){
      target.individualStyle=true;target.inheritedStyle=JSON.parse(JSON.stringify(original));
      target.fontFamily=object.fontFamily||globalAppearance('fontFamily');target.strokeMultiplier=strokeScale(object);
      target.size=object.size;target.width=object.width;target.height=object.height;
    }
  }
  function sync(){
    const object=selected(),base=sizeBaseProject?.scenes[selectedSceneIndex]?.objects[selectedObjectIndex];
    for(const id of ids){$(id).value=globalAppearance(id);$(id).disabled=false;}
    const protectedCount=project.scenes.reduce((n,scene)=>n+scene.objects.filter(item=>item.individualStyle).length,0);
    $('appearanceScope').textContent=object?`Objeto ${selectedObjectIndex+1} · ${object.type}${object.individualStyle?' · individual':''}`:`Todas las escenas${protectedCount?' · '+protectedCount+' protegidos':''}`;
    $('deselectObject').hidden=!object;$('inheritAppearance').hidden=!object?.individualStyle;
    selectedColor.hidden=!object;
    $('selectedObjectColor').disabled=!object||exporting;
    if(object){$('selectedObjectColor').value=object.color;$('selectedObjectColorValue').value=object.color.toUpperCase();}
    if(object){
      const origin=base?.inheritedStyle||base||object;
      $(objectColorControl(object)).value=object.color;
      for(const id of colors)$(id).disabled=object.type==='text'?id!=='fg':object.type==='vector'?id!=='vectorColor':!['accent','elementColor2'].includes(id);
      $('fontFamily').value=object.fontFamily||globalAppearance('fontFamily');$('fontFamily').disabled=object.type!=='text';
      const ratio=(object.type==='rect'||object.type==='line')?object.width/(origin.width||1):object.size/(origin.size||1);
      $(object.type==='text'?'textSizeAdjust':'iconSizeAdjust').value=String(Math.round(ratio*100));
      $('textSizeAdjust').disabled=object.type!=='text';$('iconSizeAdjust').disabled=object.type==='text';
      $('strokeAdjust').value=String(Math.round(strokeScale(object)*100));
      $('strokeAdjust').disabled=!hasStroke(object);
    }
    hide($('orientation').closest('.two'),Boolean(object));
    hide($('bg').parentElement,Boolean(object));
    hide(document.querySelector('.dock-appearance .swatches'),Boolean(object));
    hide(document.querySelector('.global-palette-control'),Boolean(object));
    hide($('backgroundPreset').closest('.control-stack'),Boolean(object));
    for(const id of colors)hide($(id).parentElement,Boolean(object)&&$(id).disabled);
    hide($('fontFamily').closest('.control-stack'),Boolean(object)&&object.type!=='text');
    for(const id of ['textSizeAdjust','iconSizeAdjust','strokeAdjust'])hide($(id).closest('.control-stack'),Boolean(object)&&$(id).disabled);
    for(const [control,label] of [['textSizeAdjust','textSizeValue'],['iconSizeAdjust','iconSizeValue'],['strokeAdjust','strokeAdjustValue']])$(label).textContent=$(control).value+'%';
    updateColorChips();
  }
  function syncFields(){
    const object=selected();if(!object)return;
    $('selectedObjectColor').value=object.color;$('selectedObjectColorValue').value=object.color.toUpperCase();
    const values={'Color':object.color,'Tamaño':object.size,'Ancho (0–3× lienzo)':object.width,'Alto (0–3× lienzo)':object.height,'Longitud (0–3× lienzo)':object.width};
    for(const label of $('sceneEditor').querySelectorAll('.scene-object-editor label')){
      if(Object.hasOwn(values,label.textContent)){
        const input=$(label.htmlFor),value=String(values[label.textContent]);if(input.value!==value)input.value=value;
      }
    }
    $(objectColorControl(object)).value=object.color;
    for(const [control,label] of [['textSizeAdjust','textSizeValue'],['iconSizeAdjust','iconSizeValue'],['strokeAdjust','strokeAdjustValue']])$(label).textContent=$(control).value+'%';
    $('inheritAppearance').hidden=!object.individualStyle;
  }
  function flush(){
    if(!pending)return;
    pending=false;clearTimeout(saveTimer);cancelAnimationFrame(frame);frame=0;
    syncProjectJson();updateSceneSummary(selectedSceneIndex);render(position);persistUiState();
  }
  function preview(){
    pending=true;syncFields();
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;render(position);});
    clearTimeout(saveTimer);saveTimer=setTimeout(flush,160);
  }
  function adjust(id){
    if(exporting)return;
    const value=$(id).value,object=selected();
    if(object){
      if((id==='fontFamily'||id==='fg'||id==='textSizeAdjust')&&object.type!=='text')return;
      if(id==='iconSizeAdjust'&&object.type==='text')return;
      if(colors.includes(id)&&$(id).disabled)return;
      protect(selectedSceneIndex,selectedObjectIndex);
      const base=sizeBaseProject.scenes[selectedSceneIndex].objects[selectedObjectIndex],origin=base.inheritedStyle||base;
      if(colors.includes(id)){
        object.color=base.color=value;
        if(id==='elementColor2')object.paletteSlot=base.paletteSlot='secondary';
        if(id==='accent')object.paletteSlot=base.paletteSlot='primary';
      }
      else if(id==='fontFamily')object.fontFamily=base.fontFamily=value;
      else if(id==='strokeAdjust')object.strokeMultiplier=base.strokeMultiplier=Number(value)/100;
      else{
        const ratio=Number(value)/100;
        object.size=base.size=clamp(origin.size*ratio,1,object.type==='vector'?8192:1200);
        if(object.type==='rect'||object.type==='line')object.width=base.width=clamp(origin.width*ratio,.01,3);
        if(object.type==='rect')object.height=base.height=clamp(origin.height*ratio,.01,3);
      }
      preview();return;
    }
    appearanceGlobals[id]=value;
    if(colors.includes(id)){
      for(const target of [sizeBaseProject,project])for(const scene of target?.scenes||[])for(const item of scene.objects)if(!item.individualStyle&&objectColorControl(item)===id)item.color=value;
      preview();return;
    }
    if(id==='fontFamily'||id==='strokeAdjust'){preview();return;}
    if(sizeBaseProject)updateSizeAdjustments();else{render(position);persistUiState();}
  }
  function deselect(){selectedObjectIndex=-1;if(selectedSceneIndex>=0)renderSceneEditor(selectedSceneIndex);render(position);persistUiState();}
  function inherit(){
    const object=selected(),base=sizeBaseProject?.scenes[selectedSceneIndex]?.objects[selectedObjectIndex];if(!object||!base)return;
    const origin=base.inheritedStyle;
    if(origin){base.size=origin.size;base.width=origin.width;base.height=origin.height;for(let i=0;i<base.shapes.length;i++)if(origin.strokes[i]!=null)base.shapes[i].strokeWidth=origin.strokes[i];}
    base.color=globalAppearance(objectColorControl(object));base.individualStyle=false;base.fontFamily=null;base.strokeMultiplier=null;base.inheritedStyle=null;
    updateSizeAdjustments();
  }
  function resetSizes(){
    if(typeof editHistory!=='undefined')editHistory.begin();
    try{
      const object=selected();
      for(const id of object?(object.type==='text'?['textSizeAdjust']:['iconSizeAdjust',...(hasStroke(object)?['strokeAdjust']:[])]):['textSizeAdjust','iconSizeAdjust','strokeAdjust']){$(id).value='100';adjust(id);}
      flush();
    }finally{if(typeof editHistory!=='undefined')editHistory.end();}
  }
  $('deselectObject').addEventListener('click',deselect);$('inheritAppearance').addEventListener('click',inherit);
  $('selectedObjectColor').addEventListener('input',()=>{
    const object=selected();if(!object||exporting)return;
    const control=objectColorControl(object);$(control).value=$('selectedObjectColor').value;adjust(control);
  });
  $('selectedObjectColor').addEventListener('change',flush);
  document.querySelector('.dock-appearance').addEventListener('change',flush);
  document.addEventListener('focusout',flush,true);
  document.addEventListener('pointerdown',()=>flush(),true);
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z')flush();},true);
  window.addEventListener('pagehide',flush);
  const paletteLabel=document.querySelector('label[for="applyGlobalPalette"]');
  paletteLabel.lastChild.textContent=' Aplicar paleta al importar escenas';
  sync();return {sync,adjust,protect,deselect,inherit,resetSizes,preview,flush,get pending(){return pending;}};
})();
