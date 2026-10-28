'use strict';

// Reubica los controles originales: valores, listeners y borradores siguen siendo los mismos.
var workflow = (() => {
  const shell=document.querySelector('.animotion-shell'),dock=$('animotionDock');
  const cards=Object.fromEntries([...dock.querySelectorAll('[data-dock]')].map(node=>[node.dataset.dock,node]));
  let freeOrder=[...dock.children],stageName='',tab='appearance',saved={},lastSelection='';
  try{saved=JSON.parse(localStorage.getItem('animotion.workflow.v1')||'{}')||{};}catch{}
  const nav=document.createElement('nav');nav.className='workflow-nav';nav.setAttribute('aria-label','Flujo de trabajo');
  nav.innerHTML='<div role="tablist" aria-label="Etapas"><button id="step-create" role="tab" data-step="create" aria-controls="workflow-create">Crear</button><button id="step-edit" role="tab" data-step="edit" aria-controls="workflow-edit">Editar</button><button id="step-export" role="tab" data-step="export" aria-controls="workflow-export">Exportar</button></div><details class="workflow-options"><summary aria-label="Opciones del espacio de trabajo">···</summary><button type="button" data-step="free">Vista libre</button></details>';
  document.querySelector('.page-title').replaceWith(nav);
  function area(name,html){const node=document.createElement('section');node.id='workflow-'+name;node.className='workflow-area workflow-'+name;node.setAttribute('role','tabpanel');node.setAttribute('aria-labelledby','step-'+name);node.innerHTML=html;dock.before(node);return node;}
  const create=area('create','<div id="create-script" class="workflow-stack workflow-source"></div><div id="create-prompt" class="workflow-stack workflow-prompt"></div><div id="create-json" class="workflow-stack workflow-json"></div>');
  const edit=area('edit','<div class="workflow-stack workflow-canvas"><div class="workflow-timeline-toggle"><button type="button" id="toggleTimeline" aria-expanded="false" aria-controls="workflowTimeline">Línea de tiempo</button></div><div id="workflowTimeline"></div></div><aside class="workflow-inspector"><div class="inspector-tabs" role="tablist" aria-label="Inspector"><button role="tab" data-inspector="appearance">Apariencia</button><button role="tab" data-inspector="object">Objeto</button><button role="tab" data-inspector="json">JSON de escena</button></div><p class="workflow-empty">Selecciona una escena para ver sus parámetros.</p><div class="workflow-inspector-content"></div></aside>');
  const output=area('export','<div class="workflow-stack workflow-review"></div><div class="workflow-stack workflow-output"><section class="panel workflow-export-summary"><h2>Exportar video</h2><p id="workflowExportSummary"></p><button type="button" class="primary full" id="workflowExport">↓ Descargar video</button></section></div>');
  const progress=document.createElement('div');progress.id='workflowExportProgress';progress.hidden=true;
  progress.innerHTML='<div class="workflow-export-progress-head"><span>Progreso</span><strong id="workflowExportPercent">0%</strong></div><div class="render-track" role="progressbar" aria-label="Progreso de exportación" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="workflowExportFill"></div></div><div class="workflow-export-times"><span id="workflowExportElapsed"></span><span id="workflowExportRemaining"></span></div><p id="workflowExportStatus" role="status"></p><button type="button" id="workflowExportCancel" hidden>Cancelar exportación</button>';
  $('workflowExport').after(progress);
  const editor=$('sceneEditor'),timeline=document.querySelector('.timeline-panel'),footer=document.querySelector('.anim-dock-footer');
  const inspectorContent=edit.querySelector('.workflow-inspector-content');
  inspectorContent.id='workflowInspectorContent';inspectorContent.setAttribute('role','tabpanel');
  edit.querySelectorAll('[data-inspector]').forEach(button=>{button.id='inspector-'+button.dataset.inspector;button.setAttribute('aria-controls',inspectorContent.id);});
  const timelineHost=$('workflowTimeline');let timelineOpen=Boolean(saved.timelineOpen);
  let previewFitFrame=0;
  function fitPreview(){
    cancelAnimationFrame(previewFitFrame);
    previewFitFrame=requestAnimationFrame(()=>{
      if(!['edit','export'].includes(stageName)||cards.preview.matches(':fullscreen'))return;
      const preview=cards.preview.getBoundingClientRect(),screen=$('stage').getBoundingClientRect();
      const chrome=preview.height-screen.height;
      const topbar=document.querySelector('.topbar').getBoundingClientRect().height;
      const padding=parseFloat(getComputedStyle(shell).paddingTop)||0;
      const status=$('projectFileStatus'),statusStyle=getComputedStyle(status);
      const notice=status.hidden?0:status.getBoundingClientRect().height+(parseFloat(statusStyle.marginTop)||0)+(parseFloat(statusStyle.marginBottom)||0);
      const height=Math.max(70,Math.floor(innerHeight-topbar-padding-notice-chrome-16));
      const value=height+'px';
      if(shell.style.getPropertyValue('--preview-fit-height')!==value)shell.style.setProperty('--preview-fit-height',value);
    });
  }
  const previewResize=new ResizeObserver(fitPreview);
  previewResize.observe(cards.preview);previewResize.observe(document.querySelector('.topbar'));
  previewResize.observe($('projectFileStatus'));
  window.addEventListener('resize',fitPreview);
  document.addEventListener('fullscreenchange',fitPreview);
  const fileActions=document.querySelector('.project-file-actions');
  document.querySelectorAll('.history-undo').forEach(button=>fileActions.insertBefore(button,$('openProject')));
  $('orientation').closest('.two').classList.add('export-format-controls');

  // Los estilos rápidos son combinaciones de los parámetros existentes, no otro motor de prompt.
  const direction=cards.direction.querySelector('.dock-content'),copy=$('copyPrompt'),info=$('promptInfo');
  const advanced=document.createElement('div');advanced.className='workflow-custom';advanced.id='workflowCustom';
  for(const node of [...direction.children])if(node!==copy&&node!==info)advanced.append(node);
  const quick=document.createElement('div');quick.className='workflow-presets';
  quick.innerHTML='<label for="workflowPreset">Estilo rápido</label><select id="workflowPreset"><option value="custom">Personalizado</option><option value="whiteboard">Pizarra</option><option value="sketch">Boceto</option><option value="technical">Técnico</option><option value="geometric">Geométrico</option><option value="cartoon">Caricatura</option></select><button type="button" id="customizePrompt" aria-expanded="false" aria-controls="workflowCustom">Personalizar</button>';
  direction.prepend(quick);copy.before(advanced);
  const defaults={promptLineCap:'round',promptLineJoin:'round',promptDetail:'medium',promptResources:'vectors',promptRhythm:'sequential',promptContinuity:'consistent',textUsage:'low'};
  const presets={
    whiteboard:{drawingStyle:'whiteboard',promptLineStyle:'solid',promptStrokeWeight:'light',promptFillStyle:'outline',artDirection:'illustrative',motionBoldness:'70'},
    sketch:{drawingStyle:'sketch',promptLineStyle:'sketch',promptStrokeWeight:'light',promptFillStyle:'outline',artDirection:'illustrative',motionBoldness:'55'},
    technical:{drawingStyle:'technical',promptLineStyle:'dashdot',promptStrokeWeight:'light',promptFillStyle:'outline',artDirection:'graphic',promptLineCap:'butt',promptLineJoin:'miter',motionBoldness:'35'},
    geometric:{drawingStyle:'geometric',promptLineStyle:'solid',promptStrokeWeight:'regular',promptFillStyle:'mixed',artDirection:'graphic',motionBoldness:'60'},
    cartoon:{drawingStyle:'cartoon',promptLineStyle:'solid',promptStrokeWeight:'bold',promptFillStyle:'mixed',artDirection:'illustrative',motionBoldness:'75'}
  };
  let customized=Boolean(saved.customized);
  $('workflowPreset').addEventListener('change',()=>{
    const preset=presets[$('workflowPreset').value];if(!preset){customized=true;sync();remember();return;}
    for(const [id,value] of Object.entries({...defaults,...preset}))if($(id))$(id).value=value;
    updatePromptControlLabels();$('motionBoldnessValue').textContent=$('motionBoldness').value+'%';persistUiState();
  });
  $('customizePrompt').addEventListener('click',()=>{customized=!customized;sync();remember();});
  const blank=document.createElement('button');blank.id='workflowBlank';blank.type='button';blank.textContent='Empezar en blanco';blank.className='subtle full';
  cards.json.querySelector('.dock-content').append(blank);
  blank.addEventListener('click',()=>{
    if(project.scenes.length&&!confirm('¿Reemplazar las escenas actuales por un proyecto vacío?'))return;
    $('jsonText').value=JSON.stringify({version:1,fps:Number($('fps').value),scenes:[{start:0,end:5,objects:[]}]});apply();
  });
  function remember(){try{localStorage.setItem('animotion.workflow.v1',JSON.stringify({stage:stageName,tab,timelineOpen,customized}));}catch{}}
  function sync(){
    const hasScenes=project.scenes.length>0;
    if(!hasScenes&&['edit','export'].includes(stageName))queueMicrotask(()=>{
      if(!project.scenes.length&&['edit','export'].includes(stageName))setStage('create');
    });
    const selection=`${selectedSceneIndex}:${selectionIndices().join(',')}`;
    if(selection!==lastSelection){
      lastSelection=selection;
      if(tab==='object')inspectorContent.scrollTop=0;
    }
    if(stageName==='edit'){
      const list=$('sceneList'),active=list.querySelector('.sceneItem.selected');
      if(active){const bounds=list.getBoundingClientRect(),item=active.getBoundingClientRect();if(item.left<bounds.left)list.scrollLeft+=item.left-bounds.left-3;else if(item.right>bounds.right)list.scrollLeft+=item.right-bounds.right+3;}
    }
    nav.querySelectorAll('[role="tab"]').forEach(button=>{button.disabled=button.dataset.step!=='create'&&!hasScenes;button.setAttribute('aria-selected',String(button.dataset.step===stageName));button.tabIndex=button.dataset.step===stageName||(stageName==='free'&&button.dataset.step==='create')?0:-1;});
    edit.dataset.inspector=tab;
    inspectorContent.setAttribute('aria-labelledby','inspector-'+tab);
    edit.querySelectorAll('[data-inspector]').forEach(button=>{button.setAttribute('aria-selected',String(button.dataset.inspector===tab));button.tabIndex=button.dataset.inspector===tab?0:-1;});
    edit.querySelector('.workflow-empty').hidden=tab==='appearance'||Boolean(project.scenes[selectedSceneIndex]);
    timelineHost.hidden=!timelineOpen;$('toggleTimeline').setAttribute('aria-expanded',String(timelineOpen));
    advanced.hidden=stageName!=='free'&&!customized;quick.hidden=stageName==='free';
    $('customizePrompt').setAttribute('aria-expanded',String(customized));$('customizePrompt').textContent=customized?'Cerrar personalización':'Personalizar';
    const match=Object.entries(presets).find(([,preset])=>Object.entries({...defaults,...preset}).every(([id,value])=>!$(id)||$(id).value===value));
    $('workflowPreset').value=match?.[0]||'custom';
    $('workflowExportSummary').textContent=`${project.scenes.length} escenas · ${fmt(endTime())} · ${$('orientation').value==='portrait'?'1440 × 2560':'2560 × 1440'} · ${$('fps').value} FPS`;
    $('workflowExport').disabled=!hasScenes;
    blank.hidden=hasScenes;

  }
  function inspector(next){const previous=tab;tab=['appearance','object','json'].includes(next)?next:'appearance';if(previous!==tab)inspectorContent.scrollTop=0;sync();remember();}
  function setStage(next){
    if(!['create','edit','export','free'].includes(next))return;
    if(exporting||canvasEditor.busy)return;
    if((next==='edit'||next==='export')&&!project.scenes.length)next='create';
    if(stageName===next){sync();return;}
    appearanceEditor.flush();stop();
    if(stageName==='free')freeOrder=[...dock.children];
    // Aparca todo antes de montar la etapa. No reconstruye ningún formulario.
    for(const card of freeOrder)dock.append(card);
    footer.before(timeline,editor);
    stageName=next;shell.dataset.workflowStep=next;
    create.hidden=next!=='create';edit.hidden=next!=='edit';output.hidden=next!=='export';dock.hidden=next!=='free';
    if(next==='create'){
      create.querySelector('.workflow-source').append(cards.project);
      create.querySelector('.workflow-prompt').append(cards.direction);
      create.querySelector('.workflow-json').append(cards.json);
      canvasEditor.previewAt(position);
    }else if(next==='edit'){
      const column=edit.querySelector('.workflow-canvas');column.prepend(cards.preview,cards.scenes);
      timelineHost.append(timeline);edit.querySelector('.workflow-inspector-content').append(cards.appearance,editor);
      canvasEditor.enableDrawing();
    }else if(next==='export'){
      output.querySelector('.workflow-review').append(cards.preview);
      output.querySelector('.workflow-output').prepend(cards.appearance);
      canvasEditor.previewAt(position);
    }
    const params=new URL(location.href);params.searchParams.set('step',next);history.replaceState(null,'',params);
    nav.querySelector('.workflow-options').open=false;sync();remember();
    fitPreview();
    if(next==='edit'&&timelineOpen)requestAnimationFrame(()=>timelineEditor.sync(true));
    requestAnimationFrame(()=>{
      render(position);
      if(shell.getBoundingClientRect().top<document.querySelector('.topbar').getBoundingClientRect().bottom)shell.scrollIntoView({block:'start'});
    });
  }
  nav.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>setStage(button.dataset.step)));
  const optionsMenu=nav.querySelector('.workflow-options');
  document.addEventListener('click',event=>{if(optionsMenu.open&&!optionsMenu.contains(event.target))optionsMenu.open=false;});
  optionsMenu.addEventListener('keydown',event=>{if(event.key==='Escape'){optionsMenu.open=false;optionsMenu.querySelector('summary').focus();event.stopPropagation();}});
  edit.querySelectorAll('[data-inspector]').forEach(button=>button.addEventListener('click',()=>inspector(button.dataset.inspector)));
  // Navegación de pestañas con teclado; los botones conservan su foco al cambiar etapa.
  for(const list of [nav.querySelector('[role="tablist"]'),edit.querySelector('[role="tablist"]')])list.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    const buttons=[...list.querySelectorAll('[role="tab"]')].filter(button=>!button.disabled),index=buttons.indexOf(document.activeElement);
    if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();
  });
  $('toggleTimeline').addEventListener('click',()=>{timelineOpen=!timelineOpen;sync();remember();if(timelineOpen)timelineEditor.sync(true);});
  $('workflowExport').addEventListener('click',()=>$('exportVideo').click());
  tab=['appearance','object','json'].includes(saved.tab)?saved.tab:'appearance';
  setStage(new URL(location.href).searchParams.get('step')||saved.stage||(project.scenes.length?'edit':'create'));
  if(!stageName)setStage(project.scenes.length?'edit':'create');
  return {setStage,sync,get stage(){return stageName;},enterEditor(options={}){if(stageName==='free')return;setStage('edit');inspector(options.tab||'object');}};
})();
