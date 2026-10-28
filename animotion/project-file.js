'use strict';

var projectFile = (() => {
  const format='datools-animotion-project';
  let name=cleanName(storedUiState?.projectName||'animotion-proyecto');
  const actions=document.createElement('div');actions.className='project-file-actions';
  actions.innerHTML='<button type="button" id="openProject" aria-label="Abrir proyecto" title="Abrir proyecto · Ctrl+O"><span aria-hidden="true">↥</span><span class="file-label">Abrir</span></button><button type="button" id="saveProject" aria-label="Guardar proyecto" title="Guardar proyecto · Ctrl+S"><span aria-hidden="true">↓</span><span class="file-label">Guardar</span></button><input type="file" id="projectFileInput" accept=".json,application/json" hidden aria-label="Seleccionar proyecto de Animotion">';
  document.querySelector('.topbar').append(actions);
  const status=document.createElement('p');status.id='projectFileStatus';status.className='project-file-status';status.setAttribute('role','status');status.hidden=true;
  document.querySelector('.topbar').after(status);
  function cleanName(value){return String(value).replace(/\.json$/i,'').replace(/[\x00-\x1f\\/:*?"<>|]/g,'-').trim().slice(0,100)||'animotion-proyecto';}
  function message(text,error=false){status.textContent=text;status.hidden=!text;status.classList.toggle('is-error',error);}
  const controlsList=()=>[...persistentControls.filter(control=>!['jsonText','srtText'].includes(control.id)),...['pencilColor','pencilWidth'].map($).filter(Boolean)];
  function readControls(){return Object.fromEntries(controlsList().map(control=>[control.id,control.type==='checkbox'?control.checked:globalAppearance(control.id)]));}
  function save(){
    if(exporting||canvasEditor.busy){message('Termina la edición o la exportación antes de guardar.',true);return;}
    appearanceEditor.flush();
    // Guardar la base evita perder tamaños originales cuando un fader satura el tamaño visible.
    const base=JSON.parse(JSON.stringify(sizeBaseProject||project));
    const fileData={...base,format,formatVersion:1,name,resolution:[canvas.width,canvas.height],fps:Number($('fps').value),background:$('bg').value,
      editor:{controls:readControls(),script:$('srtText').value,jsonDraft:jsonDraftDirty?$('jsonText').value:null,sceneDrafts:sceneCode.drafts(),selection:{scene:selectedSceneIndex,objects:selectionIndices(),primary:selectedObjectIndex,position}}};
    const blob=new Blob([JSON.stringify(fileData,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    message('Proyecto completo guardado.');
  }
  function validatedControls(values){
    if(values!=null&&(typeof values!=='object'||Array.isArray(values)))throw Error('Los ajustes del proyecto no son válidos.');
    const result=readControls();
    for(const control of controlsList()){
      if(!Object.hasOwn(values||{},control.id))continue;
      const value=values[control.id];
      if(control.type==='checkbox'){if(typeof value!=='boolean')throw Error(`Ajuste inválido: ${control.id}`);result[control.id]=value;}
      else if(control.tagName==='SELECT'){
        if(typeof value!=='string'||![...control.options].some(option=>option.value===value))throw Error(`Opción inválida: ${control.id}`);
        result[control.id]=value;
      }else if(control.type==='color'){
        if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw Error(`Color inválido: ${control.id}`);result[control.id]=value.toLowerCase();
      }else if(control.type==='range'){
        const number=Number(value);if((typeof value!=='number'&&typeof value!=='string')||!Number.isFinite(number)||number<Number(control.min)||number>Number(control.max))throw Error(`Valor fuera de rango: ${control.id}`);
        result[control.id]=String(number);
      }else if(control.tagName==='TEXTAREA'){
        if(typeof value!=='string'||value.length>(control.maxLength>0?control.maxLength:8000))throw Error(`Texto inválido: ${control.id}`);
        result[control.id]=value;
      }
    }
    return result;
  }
  function prepare(raw,filename){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Se requiere un proyecto JSON con escenas.');
    if(raw.format&&raw.format!==format)throw Error('El formato del archivo no es de Animotion.');
    const full=raw.format===format;
    if(full&&raw.formatVersion!==1)throw Error('Versión de proyecto no compatible.');
    if(full&&(!raw.editor||typeof raw.editor!=='object'||Array.isArray(raw.editor)))throw Error('Faltan los ajustes del proyecto completo.');
    const base=validate(raw,{preserveOrder:true}),editor=full?raw.editor:{},controls=validatedControls(editor.controls);
    controls.orientation=base.resolution[1]>base.resolution[0]?'portrait':'landscape';controls.fps=String(base.fps);
    if(!full){controls.textSizeAdjust='100';controls.iconSizeAdjust='100';}
    const script=editor.script??'';if(typeof script!=='string'||new Blob([script]).size>2*1024*1024)throw Error('El guion del proyecto no es válido o supera 2 MB.');
    const draft=editor.jsonDraft??null;if(draft!==null&&(typeof draft!=='string'||new Blob([draft]).size>5*1024*1024))throw Error('El borrador JSON no es válido o supera 5 MB.');
    const drafts=editor.sceneDrafts??[];
    if(!Array.isArray(drafts)||drafts.length>1200||drafts.some(item=>!item||!Number.isInteger(item.index)||!base.scenes[item.index]||typeof item.text!=='string'||typeof item.source!=='string'))throw Error('Los borradores de escena no son válidos.');
    const selection=editor.selection||{},scene=Number.isInteger(selection.scene)&&base.scenes[selection.scene]?selection.scene:-1;
    const objects=Array.isArray(selection.objects)?selection.objects.filter(index=>Number.isInteger(index)&&base.scenes[scene]?.objects[index]):[];
    const primary=Number.isInteger(selection.primary)?selection.primary:objects.at(-1)??-1;
    const time=typeof selection.position==='number'&&Number.isFinite(selection.position)?clamp(selection.position,0,10800):0;
    return {base,controls,script,draft,drafts,scene,objects,primary,time,name:cleanName(filename||raw.name||'animotion-proyecto')};
  }
  function openDocument(raw,filename){
    try{
      if(exporting||canvasEditor.busy)throw Error('Termina la edición o la exportación antes de abrir otro proyecto.');
      const saved=prepare(raw,filename);
      const hasWork=project.scenes.length||$('srtText').value.trim()||$('jsonText').value.trim()||sceneCode.drafts().length;
      if(hasWork&&!confirm(`¿Abrir «${saved.name}» y reemplazar el trabajo actual? Guarda tu proyecto antes de continuar si quieres conservarlo.`)){message('Apertura cancelada.');return false;}
      appearanceEditor.flush();pencilTool.deactivate();stop();editHistory.begin();
      try{
        name=saved.name;sceneCode.clear();sizeBaseProject=saved.base;project=JSON.parse(JSON.stringify(saved.base));
        for(const control of controlsList())if(control.type==='checkbox')control.checked=saved.controls[control.id];else control.value=saved.controls[control.id];
        for(const id of Object.keys(appearanceGlobals))appearanceGlobals[id]=saved.controls[id];
        $('srtText').value=saved.script;setObjectSelection(saved.scene,saved.objects,saved.primary);
        updateSizeAdjustments();resize();prepareCues();sceneList();
        sceneCode.restoreDrafts(saved.drafts);
        if(saved.draft!==null){$('jsonText').value=saved.draft;jsonDraftDirty=true;}else syncProjectJson();
        updateColorChips();updatePromptControlLabels();$('strokeAdjustValue').textContent=globalAppearance('strokeAdjust')+'%';$('bgOpacityValue').textContent=$('bgOpacity').value+'%';$('pencilWidthValue').value=$('pencilWidth').value;
        seek(saved.time);persistUiState();
      }finally{editHistory.reset();}
      message(`Proyecto abierto: ${name}.`);return true;
    }catch(problem){message(`No se pudo abrir el proyecto: ${problem.message}`,true);return false;}
  }
  $('openProject').addEventListener('click',()=>{if(!exporting&&!canvasEditor.busy)$('projectFileInput').click();});
  $('saveProject').addEventListener('click',save);
  $('projectFileInput').addEventListener('change',async event=>{
    const file=event.target.files?.[0];
    try{if(file){if(file.size>25*1024*1024)throw Error('El archivo supera 25 MB.');openDocument(JSON.parse(extractJsonText(await file.text())),file.name);}}
    catch(problem){message(`No se pudo abrir el proyecto: ${problem.message}`,true);}
    finally{event.target.value='';}
  });
  document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey)return;
    const key=event.key.toLowerCase();if(key==='s'){event.preventDefault();save();}else if(key==='o'){event.preventDefault();$('openProject').click();}
  });
  return {save,openDocument,get name(){return name;}};
})();
