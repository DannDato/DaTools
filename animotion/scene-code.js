'use strict';

var sceneCode = (() => {
  const drafts=new Map();let index=-1,saveTimer=0;
  const panel=document.createElement('section');panel.className='scene-code-panel';
  panel.innerHTML='<div class="scene-code-heading"><label for="sceneJsonText" id="sceneJsonLabel">JSON de la escena</label><div class="scene-code-actions"><button type="button" id="copySceneJson">Copiar</button><button type="button" id="pasteSceneJson">Pegar</button></div></div><textarea id="sceneJsonText" spellcheck="false" wrap="off" aria-labelledby="sceneJsonLabel"></textarea><div class="scene-code-actions"><button type="button" class="primary" id="applySceneJson">Aplicar escena</button><button type="button" id="resetSceneJson">Restaurar</button></div><p id="sceneJsonStatus" role="status"></p>';
  const input=panel.querySelector('textarea'),status=panel.querySelector('[role=status]');
  const actual=i=>JSON.stringify(project.scenes[i],null,2);
  function entry(i){if(!drafts.has(i))drafts.set(i,{text:actual(i),source:actual(i),dirty:false});return drafts.get(i);}
  for(const draft of Array.isArray(storedUiState?.sceneDrafts)?storedUiState.sceneDrafts:[]){
    if(Number.isInteger(draft.index)&&project.scenes[draft.index]&&typeof draft.text==='string'&&typeof draft.source==='string')drafts.set(draft.index,{text:draft.text,source:draft.source,dirty:true});
  }
  function sync(){
    if(!project.scenes[index])return;
    const current=actual(index),draft=entry(index);
    if(!draft.dirty){draft.source=current;draft.text=current;}
    if(input.value!==draft.text)input.value=draft.text;
    panel.querySelector('label').textContent=`JSON · escena ${index+1}`;
    panel.querySelector('#applySceneJson').disabled=exporting||!draft.dirty;
    status.textContent=draft.error|| (draft.dirty?(draft.source!==current?'Borrador pendiente. La escena cambió desde que empezaste a editarlo.':'Cambios sin aplicar.'):'Sin cambios pendientes.');
  }
  function saveSoon(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persistUiState(),250);}
  input.addEventListener('input',()=>{
    if(!project.scenes[index])return;
    const draft=entry(index);draft.text=input.value;draft.dirty=input.value!==actual(index);draft.error=false;
    sync();saveSoon();
  });
  function restore(){
    if(!project.scenes[index])return;
    if(entry(index).dirty&&!confirm('¿Descartar el borrador y recuperar el JSON de la escena aplicada?'))return;
    drafts.delete(index);sync();persistUiState();
  }
  async function copy(){
    const selected=index,text=input.value;
    try{
      let copied=false;
      if(navigator.clipboard?.writeText)try{await navigator.clipboard.writeText(text);copied=true;}catch(_){}
      if(!copied){input.focus();input.select();if(!document.execCommand('copy'))throw Error('Copia bloqueada');}
      if(index===selected)status.textContent='JSON de la escena copiado.';
    }catch(_){if(index===selected){input.focus();input.select();status.textContent='Usa Ctrl+C (o ⌘C) para copiar el fragmento seleccionado.';}}
  }
  async function paste(){
    const selected=index;
    try{
      if(!navigator.clipboard?.readText)throw Error('Portapapeles bloqueado');
      const text=await navigator.clipboard.readText();
      if(!text.trim())throw Error('El portapapeles está vacío');
      if(new Blob([text]).size>5*1024*1024)throw Error('El fragmento supera 5 MB');
      if(!project.scenes[selected])return;
      const draft=entry(selected);draft.text=text;draft.dirty=text!==actual(selected);draft.error=false;
      if(index===selected)sync();saveSoon();
    }catch(problem){if(index===selected){input.focus();status.textContent=`${problem.message}. Puedes pegar aquí con Ctrl+V (o ⌘V).`;}}
  }
  function applyScene(){
    if(exporting||canvasEditor.busy||!project.scenes[index])return;
    appearanceEditor.flush();
    const target=index;
    try{
      if(new Blob([input.value]).size>5*1024*1024)throw Error('El fragmento supera 5 MB');
      let raw=JSON.parse(extractJsonText(input.value));
      if(Array.isArray(raw)){if(raw.length!==1)throw Error('Pega una sola escena');raw=raw[0];}
      else if(Array.isArray(raw?.scenes)){if(raw.scenes.length!==1)throw Error('Pega una sola escena, no el proyecto completo');raw=raw.scenes[0];}
      const scene=validate({scenes:[raw]}).scenes[0],base=JSON.parse(JSON.stringify(scene));
      const textScale=Number(globalAppearance('textSizeAdjust'))/100,objectScale=Number(globalAppearance('iconSizeAdjust'))/100;
      for(const [i,object] of base.objects.entries()){
        if(object.individualStyle)continue;
        const scale=object.type==='text'?textScale:objectScale;
        if(object.size/scale>(object.type==='vector'?8192:1200)||((object.type==='rect'||object.type==='line')&&object.width/objectScale>3)||(object.type==='rect'&&object.height/objectScale>3)){
          for(const target of [object,scene.objects[i]]){target.individualStyle=true;target.fontFamily=target.fontFamily||globalAppearance('fontFamily');target.strokeMultiplier=target.strokeMultiplier??strokeScale();}
          continue;
        }
        object.size/=scale;
        if(object.type==='rect'||object.type==='line')object.width/=objectScale;
        if(object.type==='rect')object.height/=objectScale;
      }
      stop();project.scenes[target]=scene;sizeBaseProject.scenes[target]=base;drafts.delete(target);
      setObjectSelection(target,[]);syncProjectJson();sceneList();seek(scene.start);persistUiState();
      status.textContent=`Escena ${target+1} actualizada.`;
    }catch(problem){entry(target).error=`⚠ ${problem.message}`;status.textContent=entry(target).error;}
  }
  panel.querySelector('#copySceneJson').addEventListener('click',copy);panel.querySelector('#pasteSceneJson').addEventListener('click',paste);
  panel.querySelector('#applySceneJson').addEventListener('click',applyScene);panel.querySelector('#resetSceneJson').addEventListener('click',restore);
  window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);persistUiState();});
  const api={
    mount(i,editor){const changed=index!==i;index=i;editor.append(panel);sync();if(changed)input.scrollTop=0;},
    sync,clear(){clearTimeout(saveTimer);drafts.clear();},
    restoreDrafts(values){
      clearTimeout(saveTimer);drafts.clear();
      for(const value of values||[])if(Number.isInteger(value.index)&&project.scenes[value.index]&&typeof value.text==='string'&&typeof value.source==='string')drafts.set(value.index,{text:value.text,source:value.source,dirty:true});
      sync();
    },
    drafts(){return [...drafts].filter(([,value])=>value.dirty).map(([i,value])=>({index:i,text:value.text,source:value.source}));}
  };
  if(project.scenes[selectedSceneIndex]&&!$('sceneEditor').hidden)api.mount(selectedSceneIndex,$('sceneEditor'));
  return api;
})();
