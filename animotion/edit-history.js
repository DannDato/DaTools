'use strict';

// Historial de la sesión: un arrastre o una edición continua cuentan como un paso.
var editHistory = (() => {
  const ids=['orientation','fps','bg','fg','accent','elementColor2','vectorColor','applyGlobalPalette','fontFamily','backgroundPreset','bgEffectColor','bgEffectColor2','bgOpacity','textSizeAdjust','iconSizeAdjust','strokeAdjust'];
  const steps=[];
  let restoring=false,depth=0,group=null,lastGroup=null,groupTarget=null;
  const undoButton=document.createElement('button');undoButton.type='button';undoButton.className='history-undo';undoButton.textContent='↶';
  undoButton.setAttribute('aria-label','Deshacer cambio');undoButton.title='Deshacer · Ctrl+Z (20 pasos)';
  document.querySelector('.canvas-edit-toggle').before(undoButton);
  function snapshot(){
    const controls=Object.fromEntries(ids.map(id=>[id,$(id).type==='checkbox'?$(id).checked:globalAppearance(id)]));
    const model=JSON.stringify({project,base:sizeBaseProject,controls});
    return {model,json:$('jsonText').value,dirty:jsonDraftDirty,scene:selectedSceneIndex,object:selectedObjectIndex,position};
  }
  let last=snapshot();
  function update(){undoButton.disabled=!steps.length||exporting;undoButton.title=`Deshacer · Ctrl+Z · ${steps.length}/20 pasos`;}
  function record(){
    if(restoring||depth)return;
    const next=snapshot();
    if(next.model!==last.model){
      if(!group||group!==lastGroup){steps.push(last);if(steps.length>20)steps.shift();}
      lastGroup=group;
    }
    last=next;update();
  }
  function undo(){
    if(exporting||canvasEditor.busy||!steps.length)return;
    const state=steps.pop(),saved=JSON.parse(state.model);restoring=true;
    try{
      stop();project=saved.project;sizeBaseProject=saved.base;
      if(appearanceGlobals)for(const id of Object.keys(appearanceGlobals))appearanceGlobals[id]=saved.controls[id];
      for(const [id,value] of Object.entries(saved.controls)){
        if($(id).type==='checkbox')$(id).checked=value;else $(id).value=value;
      }
      selectedSceneIndex=state.scene;selectedObjectIndex=state.object;
      jsonDraftDirty=true;
      updateColorChips();updatePromptControlLabels();
      $('textSizeValue').textContent=$('textSizeAdjust').value+'%';
      $('iconSizeValue').textContent=$('iconSizeAdjust').value+'%';
      $('strokeAdjustValue').textContent=$('strokeAdjust').value+'%';
      $('bgOpacityValue').textContent=$('bgOpacity').value+'%';
      resize();$('jsonText').value=state.json;jsonDraftDirty=state.dirty;
      sceneList();seek(state.position);$('jsonInfo').textContent='Cambio deshecho.';persistUiState();
    }finally{restoring=false;group=null;groupTarget=null;lastGroup=null;last=snapshot();update();}
  }
  document.addEventListener('pointerdown',event=>{
    groupTarget=event.target.closest('input,textarea,select');group=groupTarget?{}:null;
  },true);
  document.addEventListener('input',event=>{
    if(groupTarget!==event.target){groupTarget=event.target;group={};}
  },true);
  document.addEventListener('focusout',()=>{group=null;groupTarget=null;},true);
  document.addEventListener('pointerup',()=>{group=null;groupTarget=null;});
  document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.shiftKey||event.altKey||event.key.toLowerCase()!=='z')return;
    if(event.target.closest('textarea,[contenteditable]:not([contenteditable=false])'))return;
    event.preventDefault();undo();
  });
  undoButton.addEventListener('click',undo);update();
  return {record,undo,begin(){depth++;},end(){depth=Math.max(0,depth-1);if(!depth)record();},get length(){return steps.length;}};
})();
