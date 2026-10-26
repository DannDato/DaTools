/* Teleprompter de DaTools. Texto local, desplazamiento medido y posición persistente. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const ids=['speed','fontSize','textWidth','lineHeight','countdown','mirror','guide','textColor','backgroundColor'];
  const STORAGE_KEY='datools.teleprompter.v1',MAX_TEXT=200000;
  const viewport=$('viewport'),panel=$('readerPanel');
  let fraction=0,words=0,state='paused',frame=0,lastTick=0,countdownEnd=0,lastCount=-1;
  let saveTimer,noticeTimer,lastSave=0,lastProgrammaticTop=-1,filename='guion',storageFailed=false;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const duration=()=>words?words/Number($('speed').value)*60:0;
  const maxScroll=()=>Math.max(0,viewport.scrollHeight-viewport.clientHeight);
  function fmt(seconds){const value=Math.max(0,Math.floor(seconds||0));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}
  function notice(message){clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,4500);}
  function save(){
    clearTimeout(saveTimer);
    lastSave=performance.now();
    const controls={};for(const id of ids)controls[id]=$(id).type==='checkbox'?$(id).checked:$(id).value;
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,script:$('script').value,controls,fraction,filename}));
      $('saveStatus').textContent='Guardado';storageFailed=false;
    }catch(_){$('saveStatus').textContent='Sin guardado automático';if(!storageFailed)notice('El navegador no permite guardar el guion. Puedes descargarlo como TXT.');storageFailed=true;}
  }
  function scheduleSave(){clearTimeout(saveTimer);if(!storageFailed)$('saveStatus').textContent='Guardando…';saveTimer=setTimeout(save,300);}
  function restore(){
    try{
      const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(!stored||stored.version!==1)return;
      if(typeof stored.script==='string')$('script').value=stored.script.slice(0,MAX_TEXT);
      if(Number.isFinite(stored.fraction))fraction=clamp(stored.fraction,0,1);
      if(typeof stored.filename==='string')filename=stored.filename.slice(0,120)||'guion';
      for(const id of ids){
        const control=$(id),value=stored.controls?.[id];
        if(control.type==='checkbox'){if(typeof value==='boolean')control.checked=value;}
        else if(control.type==='range'){if(Number.isFinite(Number(value))&&value!=null)control.value=String(clamp(Number(value),Number(control.min),Number(control.max)));}
        else if(control.type==='color'){if(/^#[0-9a-f]{6}$/i.test(value))control.value=value;}
        else if([...control.options].some(option=>option.value===value))control.value=value;
      }
    }catch(_){/* Un estado ausente o dañado no impide usar la herramienta. */}
  }
  function updateStatus(){
    const total=duration();$('seek').value=String(Math.round(fraction*1000));
    $('seek').setAttribute('aria-valuetext',`${Math.round(fraction*100)}% · ${fmt(fraction*total)}`);
    $('clock').textContent=`${fmt(fraction*total)} / ${fmt(total)}`;
    $('play').disabled=!words;$('seek').disabled=!words;$('restart').disabled=!words;$('downloadScript').disabled=!$('script').value.trim();
    $('play').textContent=state==='playing'?'Ⅱ Pausar':state==='counting'?'■ Cancelar':'▶ Reproducir';
    $('play').setAttribute('aria-label',state==='playing'?'Pausar lectura':state==='counting'?'Cancelar cuenta atrás':'Reproducir lectura');
    const message=!words?'Esperando guion':state==='playing'?'Leyendo':state==='counting'?'Prepárate…':fraction>=1?'Guion terminado':fraction>0?'En pausa':'Listo para leer';
    if($('playStatus').textContent!==message)$('playStatus').textContent=message;
  }
  function positionReader(){lastProgrammaticTop=Math.round(maxScroll()*fraction);viewport.scrollTop=lastProgrammaticTop;updateStatus();}
  function measure(){
    const line=Number($('fontSize').value)*Number($('lineHeight').value),height=viewport.clientHeight;
    const center=height*.42;
    panel.style.setProperty('--read-top',`${Math.max(0,center-line/2)}px`);
    panel.style.setProperty('--read-bottom',`${Math.max(0,height-center-line/2)}px`);
    panel.style.setProperty('--guide-top',`${viewport.offsetTop+center}px`);
    panel.style.setProperty('--guide-height',`${line}px`);
    positionReader();
  }
  function applySettings(){
    panel.style.setProperty('--read-size',`${$('fontSize').value}px`);
    panel.style.setProperty('--read-leading',$('lineHeight').value);
    panel.style.setProperty('--read-width',`${$('textWidth').value}%`);
    panel.style.setProperty('--read-color',$('textColor').value);
    panel.style.setProperty('--read-bg',$('backgroundColor').value);
    panel.style.setProperty('--read-mirror',$('mirror').checked?'-1':'1');
    $('speedValue').value=`${$('speed').value} ppm`;$('fontSizeValue').value=`${$('fontSize').value} px`;$('textWidthValue').value=`${$('textWidth').value}%`;
    $('guideBand').hidden=!$('guide').checked||!words;
    $('estimatedTime').textContent=`${fmt(duration())} de lectura`;
    measure();
  }
  function pause(){
    cancelAnimationFrame(frame);frame=0;state='paused';$('countdownOverlay').hidden=true;updateStatus();scheduleSave();
  }
  function updateScript(resetPosition=true){
    pause();if(resetPosition)fraction=0;
    const text=$('script').value.trim();words=text?text.split(/\s+/u).length:0;
    $('readerText').textContent=text;$('emptyReader').hidden=Boolean(words);$('scriptContent').hidden=!words;
    $('wordCount').textContent=`${words.toLocaleString('es-MX')} ${words===1?'palabra':'palabras'}`;
    if(!words)fraction=0;applySettings();scheduleSave();
  }
  function advance(now){
    frame=0;
    if(state==='counting'){
      const left=Math.ceil((countdownEnd-now)/1000);
      if(left>0){if(left!==lastCount){$('countdownNumber').textContent=String(left);lastCount=left;}frame=requestAnimationFrame(advance);return;}
      $('countdownOverlay').hidden=true;state='playing';lastTick=now;updateStatus();
    }
    if(state!=='playing')return;
    const delta=Math.min(.25,Math.max(0,(now-lastTick)/1000));lastTick=now;
    fraction=clamp(fraction+delta/Math.max(.1,duration()),0,1);positionReader();
    if(fraction>=1){pause();save();return;}
    if(now-lastSave>2000)save();
    frame=requestAnimationFrame(advance);
  }
  function togglePlay(){
    if(state!=='paused'){pause();return;}
    if(!words)return;
    if(fraction>=1)fraction=0;
    positionReader();const wait=Number($('countdown').value);
    if(wait){state='counting';countdownEnd=performance.now()+wait*1000;lastCount=wait;$('countdownNumber').textContent=String(wait);$('countdownOverlay').hidden=false;}
    else{state='playing';lastTick=performance.now();}
    updateStatus();frame=requestAnimationFrame(advance);
  }
  function seek(value){pause();fraction=clamp(value,0,1);positionReader();scheduleSave();}
  function readingMode(){
    const active=document.body.classList.toggle('is-reading');$('readingMode').setAttribute('aria-pressed',String(active));$('readingMode').textContent=active?'Editar guion':'Modo lectura';
    measure();
  }
  async function fullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(panel.requestFullscreen)await panel.requestFullscreen();
      else{if(!document.body.classList.contains('is-reading'))readingMode();notice('Pantalla completa no disponible. Se activó el modo lectura.');}
    }catch(_){notice('No se pudo activar la pantalla completa. Puedes usar el modo lectura.');}
  }
  function readSrt(text){
    const blocks=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim().split(/\n\s*\n/);
    const cues=blocks.map(block=>{const lines=block.split('\n'),index=lines.findIndex(line=>/\d+:\d+.*-->/.test(line));return index>=0?lines.slice(index+1).join(' ').replace(/<[^>]*>/g,'').trim():'';}).filter(Boolean);
    return cues.length?cues.join('\n\n'):text;
  }
  async function importFile(file){
    if(!file)return;
    if(!/\.(txt|md|srt)$/i.test(file.name)){notice('Importa un archivo TXT, MD o SRT.');return;}
    if(file.size>2*1024*1024){notice('Este archivo es demasiado grande para un guion.');return;}
    try{
      let text=await file.text();if(/\.srt$/i.test(file.name))text=readSrt(text);
      if(text.length>MAX_TEXT){notice('El guion supera el límite de 200 000 caracteres.');return;}
      $('script').value=text;filename=file.name.replace(/\.[^.]+$/,'')||'guion';updateScript();notice('Guion importado.');
    }catch(_){notice('No se pudo leer el archivo.');}
  }
  $('script').addEventListener('input',()=>updateScript());
  for(const id of ids)$(id).addEventListener($(id).type==='range'||$(id).type==='color'?'input':'change',()=>{applySettings();scheduleSave();});
  $('play').addEventListener('click',togglePlay);$('restart').addEventListener('click',()=>seek(0));
  $('seek').addEventListener('input',()=>seek(Number($('seek').value)/1000));
  $('readingMode').addEventListener('click',readingMode);$('fullscreen').addEventListener('click',fullscreen);
  $('importScript').addEventListener('click',()=>$('scriptFile').click());
  $('scriptFile').addEventListener('change',event=>{importFile(event.target.files[0]);event.target.value='';});
  $('downloadScript').addEventListener('click',()=>{
    const blob=new Blob([$('script').value],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`${filename}.txt`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  });
  for(const name of ['dragover','drop'])document.addEventListener(name,event=>event.preventDefault());
  document.querySelector('.tp-script-panel').addEventListener('drop',event=>{event.preventDefault();importFile(event.dataTransfer.files[0]);});
  viewport.addEventListener('wheel',()=>{if(state!=='paused')pause();},{passive:true});
  viewport.addEventListener('touchstart',()=>{if(state!=='paused')pause();},{passive:true});
  viewport.addEventListener('scroll',()=>{
    if(state!=='paused'||Math.abs(viewport.scrollTop-lastProgrammaticTop)<1)return;
    if(maxScroll()>0){fraction=clamp(viewport.scrollTop/maxScroll(),0,1);updateStatus();scheduleSave();}
  },{passive:true});
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.altKey||event.metaKey||event.isComposing||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
    let handled=true;
    if(event.code==='Space'){if(event.target.closest('button'))return;if(!event.repeat)togglePlay();}
    else if(event.key==='ArrowUp'||event.key==='ArrowDown'){$('speed').value=String(clamp(Number($('speed').value)+(event.key==='ArrowUp'?5:-5),60,300));applySettings();scheduleSave();}
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight')seek(fraction+(event.key==='ArrowRight'?5:-5)/Math.max(1,duration()));
    else if(event.key==='Home')seek(0);else if(event.key==='End')seek(1);
    else if(event.key.toLowerCase()==='r')seek(0);else if(event.key.toLowerCase()==='f'){if(!event.repeat)fullscreen();}
    else if(event.key==='Escape'){pause();if(document.body.classList.contains('is-reading'))readingMode();}
    else handled=false;
    if(handled)event.preventDefault();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state!=='paused')pause();});
  document.addEventListener('fullscreenchange',()=>{const active=Boolean(document.fullscreenElement);$('fullscreen').setAttribute('aria-pressed',String(active));$('fullscreen').textContent=active?'⛶ Salir de pantalla completa':'⛶ Pantalla completa';measure();});
  window.addEventListener('pagehide',save);
  if(window.ResizeObserver)new ResizeObserver(measure).observe(viewport);else window.addEventListener('resize',measure);
  restore();updateScript(false);
})();
