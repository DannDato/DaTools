'use strict';

// Historial de la sesión: un arrastre o una edición continua cuentan como un paso.
var editHistory = (() => {
  const ids=['orientation','fps','bg','fg','accent','elementColor2','vectorColor','applyGlobalPalette','fontFamily','backgroundPreset','backgroundMotion','backgroundSpeed','bgEffectColor','bgEffectColor2','bgOpacity','textSizeAdjust','iconSizeAdjust','strokeAdjust'];
  const steps=[],future=[];
  let restoring=false,depth=0,group=null,lastGroup=null,groupTarget=null;
  const undoButton=document.createElement('button');undoButton.type='button';undoButton.className='history-undo';undoButton.textContent='↶';
  undoButton.setAttribute('aria-label','Deshacer cambio');undoButton.title='Deshacer · Ctrl+Z (20 pasos)';
  document.querySelector('.canvas-edit-toggle').before(undoButton);
  const redoButton=document.createElement('button');redoButton.type='button';redoButton.className='history-undo history-redo';redoButton.textContent='↷';
  redoButton.setAttribute('aria-label','Rehacer cambio');undoButton.after(redoButton);
  function snapshot(){
    const controls=Object.fromEntries(ids.map(id=>[id,$(id).type==='checkbox'?$(id).checked:globalAppearance(id)]));
    const model=JSON.stringify({project,base:sizeBaseProject,controls});
    return {model,json:$('jsonText').value,dirty:jsonDraftDirty,scene:selectedSceneIndex,object:selectedObjectIndex,selectedObjects:selectionIndices(),position};
  }
  let last=snapshot();
  function update(){
    undoButton.disabled=!steps.length||exporting;undoButton.title=`Deshacer · Ctrl+Z · ${steps.length}/20 pasos`;
    redoButton.disabled=!future.length||exporting;redoButton.title=`Rehacer · Ctrl+Shift+Z / Ctrl+Y · ${future.length}/20 pasos`;
  }
  function record(){
    if(restoring||depth)return;
    const next=snapshot();
    if(next.model!==last.model){
      future.length=0;
      if(!group||group!==lastGroup){steps.push(last);if(steps.length>20)steps.shift();}
      lastGroup=group;
    }
    last=next;update();
  }
  function restore(state,message){
    const saved=JSON.parse(state.model);restoring=true;
    try{
      stop();project=saved.project;sizeBaseProject=saved.base;
      if(appearanceGlobals)for(const id of Object.keys(appearanceGlobals))appearanceGlobals[id]=saved.controls[id];
      for(const [id,value] of Object.entries(saved.controls)){
        if($(id).type==='checkbox')$(id).checked=value;else $(id).value=value;
      }
      selectedSceneIndex=state.scene;selectedObjectIndex=state.object;
      setObjectSelection(state.scene,state.selectedObjects||[state.object],state.object);
      jsonDraftDirty=true;
      updateColorChips();updatePromptControlLabels();
      $('textSizeValue').textContent=$('textSizeAdjust').value+'%';
      $('iconSizeValue').textContent=$('iconSizeAdjust').value+'%';
      $('strokeAdjustValue').textContent=$('strokeAdjust').value+'%';
      $('bgOpacityValue').textContent=$('bgOpacity').value+'%';
      resize();$('jsonText').value=state.json;jsonDraftDirty=state.dirty;
      sceneList();seek(state.position);$('jsonInfo').textContent=message;persistUiState();
    }finally{restoring=false;group=null;groupTarget=null;lastGroup=null;last=snapshot();update();}
  }
  function travel(source,target,message){
    if(exporting||canvasEditor.busy)return;
    if(typeof appearanceEditor!=='undefined')appearanceEditor.flush();
    if(!source.length)return;
    target.push(snapshot());if(target.length>20)target.shift();
    restore(source.pop(),message);
  }
  function undo(){travel(steps,future,'Cambio deshecho.');}
  function redo(){travel(future,steps,'Cambio rehecho.');}
  document.addEventListener('pointerdown',event=>{
    groupTarget=event.target.closest('input,textarea,select');group=groupTarget?{}:null;
  },true);
  document.addEventListener('input',event=>{
    if(groupTarget!==event.target){groupTarget=event.target;group={};}
  },true);
  document.addEventListener('focusout',()=>{group=null;groupTarget=null;},true);
  document.addEventListener('pointerup',()=>{group=null;groupTarget=null;});
  document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
    const key=event.key.toLowerCase();
    const isRedo=(key==='z'&&event.shiftKey)||(key==='y'&&!event.shiftKey);
    if(!isRedo&&!(key==='z'&&!event.shiftKey))return;
    if(event.target.closest('textarea,[contenteditable]:not([contenteditable=false])'))return;
    event.preventDefault();if(isRedo)redo();else undo();
  });
  undoButton.addEventListener('click',undo);redoButton.addEventListener('click',redo);update();
  return {record,undo,redo,begin(){depth++;},end(){depth=Math.max(0,depth-1);if(!depth)record();},reset(){steps.length=0;future.length=0;depth=0;group=null;groupTarget=null;lastGroup=null;last=snapshot();update();},get length(){return steps.length;},get redoLength(){return future.length;}};
})();
