/* Convertidor de audio local: mismo flujo de filas y lotes que las imágenes. */
(() => {
  'use strict';
  const $=id=>document.getElementById(`au-${id}`);
  const ui={input:$('file-input'),drop:$('dropzone'),format:$('format'),bitrate:$('bitrate'),sample:$('sample-rate'),channels:$('channels'),list:$('file-list'),action:$('optimize'),cancel:$('cancel'),clear:$('clear')};
  const mime={mp3:'audio/mpeg',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',opus:'audio/ogg;codecs=opus',m4a:'audio/mp4'};
  const engine=new ImanageAudioEngine();
  const noteIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/></svg>';
  const resetIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg>';
  const removeIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 3h4m-8 4 1 14h10l1-14M10 11v6m4-6v6"/></svg>';
  let items=[],serial=0,busy=false,archiving=false,cancelled=false,toastTimer;
  const ready=item=>item.status==='ready',target=item=>item.targetFormat||ui.format.value;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  const size=bytes=>bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(2)} MB`;
  function time(seconds){if(!Number.isFinite(seconds))return '';return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;}
  function notice(message,error=false){const toast=document.getElementById('toast');clearTimeout(toastTimer);toast.textContent=message;toast.classList.toggle('is-error',error);toast.classList.add('is-visible');toastTimer=setTimeout(()=>toast.classList.remove('is-visible'),4700);}
  function reset(item){if(item.resultUrl)URL.revokeObjectURL(item.resultUrl);Object.assign(item,{output:null,resultUrl:null,status:'pending',error:'',metadata:null});}
  function progress(percent,label){$('progress-block').hidden=false;const value=Math.max(0,Math.min(100,Math.round(percent)));$('progress-percent').textContent=`${value}%`;$('progress-label').textContent=label;$('progress-fill').style.width=`${value}%`;$('progress-track').setAttribute('aria-valuenow',String(value));}
  function button(label,className,click,disabled,icon){const b=document.createElement('button');b.type='button';b.className=className;b.disabled=disabled;b.title=label;b.setAttribute('aria-label',label);if(icon)b.innerHTML=icon;else b.textContent=label;b.addEventListener('click',click);return b;}
  function updateControls(){
    const formats=new Set([ui.format.value,...items.map(target)]);
    ui.bitrate.disabled=busy||archiving||![...formats].some(format=>['mp3','ogg','opus','m4a'].includes(format));
    const hints={mp3:'MP3 permite ajustar el peso mediante el bitrate.',wav:'WAV PCM de 16 bits. El archivo puede pesar más.',flac:'FLAC conserva la señal sin añadir pérdidas.',ogg:'OGG usa bitrate variable: el valor elegido orienta la calidad, no un peso exacto.',opus:'Opus se exporta a 48 kHz.',m4a:'M4A con audio AAC y bitrate ajustable.'};
    $('format-hint').textContent=hints[ui.format.value];
  }
  function render(){
    const locked=busy||archiving,complete=items.length>0&&items.every(ready);
    [ui.input,ui.format,ui.sample,ui.channels].forEach(control=>control.disabled=locked);updateControls();
    ui.drop.classList.toggle('is-disabled',locked);ui.drop.setAttribute('aria-disabled',String(locked));
    ui.clear.disabled=locked||!items.length;ui.action.disabled=locked||!items.length;ui.cancel.hidden=!busy;
    ui.action.textContent=archiving?'Creando ZIP…':busy?'Convirtiendo…':complete?(items.length===1?'Descargar':'Descargar todo'):(items.length===1?'Convertir':'Convertir todo');
    ui.action.classList.toggle('is-download',complete);if(complete&&!locked)ImanageFiles.decorateDownload(ui.action);
    $('empty-state').hidden=items.length>0;$('files-count').textContent=String(items.length);ui.list.replaceChildren();
    for(const item of items){
      const row=document.createElement('article');row.className='im-file im-audio-file';
      const icon=document.createElement('span');icon.className='im-thumb im-audio-icon';icon.innerHTML=noteIcon;
      const detail=document.createElement('div');detail.className='im-file-detail';
      const name=document.createElement('div');name.className='im-file-name';name.textContent=item.file.name;name.title=item.file.name;
      const meta=document.createElement('div');meta.className='im-file-meta';
      const stream=item.metadata?.streams?.find(stream=>stream.codec_type==='audio');
      meta.textContent=`${item.ext.toUpperCase()} · ${size(item.file.size)}${ready(item)?` → ${item.format.toUpperCase()}${stream?.sample_rate?` · ${Number(stream.sample_rate)/1000} kHz`:''}${stream?.channels?` · ${stream.channels===1?'mono':stream.channels+' canales'}`:''}`:''}`;
      const player=document.createElement('audio');player.className='im-audio-player';player.controls=true;player.preload='none';player.src=item.resultUrl||item.sourceUrl;
      player.setAttribute('aria-label',`${ready(item)?'Escuchar resultado':'Escuchar original'} ${item.file.name}`);
      player.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==player)other.pause();}));
      detail.append(name,meta,player);
      const result=document.createElement('div');result.className='im-file-status';
      const weight=document.createElement('span');weight.className='im-file-size';weight.textContent=ready(item)?`${size(item.file.size)} → ${size(item.output.size)}`:size(item.file.size);
      const status=document.createElement('span');status.className='im-file-status-text';
      status.textContent=ready(item)?`Listo${time(Number(item.metadata?.format?.duration))?' · '+time(Number(item.metadata.format.duration)):''}`:item.status==='working'?'Convirtiendo…':item.status==='error'?item.error:'Pendiente de convertir';
      status.title=item.error||status.textContent;if(item.status==='error')status.classList.add('is-error');else if(ready(item))status.classList.add('is-saved');result.append(weight,status);
      const actions=document.createElement('div');actions.className='im-row-actions';
      const format=document.createElement('select');format.className='im-item-format';format.disabled=locked;format.setAttribute('aria-label',`Formato de salida de ${item.file.name}`);
      const inherited=document.createElement('option');inherited.value='';inherited.textContent=`General · ${ui.format.value.toUpperCase()}`;format.append(inherited);
      for(const option of ui.format.options)format.append(option.cloneNode(true));format.value=item.targetFormat||'';
      format.addEventListener('change',()=>{item.targetFormat=format.value;reset(item);render();ui.list.querySelectorAll('.im-item-format')[items.indexOf(item)]?.focus();});
      const restore=button(`Restablecer ${item.file.name}`,'im-file-action reset',()=>{reset(item);render();},locked||item.status==='pending',resetIcon);
      const label=ready(item)?'Descargar':item.status==='working'?'Convirtiendo…':item.status==='error'?'Reintentar':'Convertir';
      const action=button(label,'im-file-action im-item-primary',()=>ready(item)?ImanageFiles.saveBlob(item.output,item.name):convertItems(item.id),locked);
      action.setAttribute('aria-label',`${label} ${item.file.name}`);action.classList.toggle('is-download',ready(item));if(ready(item))ImanageFiles.decorateDownload(action,true);
      const remove=button(`Quitar ${item.file.name}`,'im-file-action remove',()=>{reset(item);URL.revokeObjectURL(item.sourceUrl);items=items.filter(other=>other!==item);render();},locked,removeIcon);
      actions.append(format,restore,action,remove);
      const trim=document.createElement('details');trim.className='im-audio-trim';trim.open=Boolean(item.trimOpen);
      const summary=document.createElement('summary');summary.textContent='Recortar';trim.append(summary);trim.addEventListener('toggle',()=>{if(trim.isConnected)item.trimOpen=trim.open;});
      const fields=document.createElement('div');fields.className='im-audio-trim-fields';
      for(const [key,text,defaultValue] of [['start','Inicio (segundos)',0],['end','Fin (opcional)','']]){
        const field=document.createElement('label');field.textContent=text;const input=document.createElement('input');input.type='number';input.min='0';input.step='0.1';input.value=item[key]??defaultValue;input.disabled=locked;input.setAttribute('aria-label',`${text} de ${item.file.name}`);
        // No reconstruir la fila al perder el foco: eliminaría el botón que se está pulsando.
        input.addEventListener('input',()=>{
          item[key]=input.validity.badInput?NaN:input.value;item.trimOpen=true;reset(item);
          meta.textContent=`${item.ext.toUpperCase()} · ${size(item.file.size)}`;
          weight.textContent=size(item.file.size);status.textContent='Pendiente de convertir';status.classList.remove('is-saved','is-error');
          action.textContent='Convertir';action.classList.remove('is-download');action.title='Convertir';action.setAttribute('aria-label',`Convertir ${item.file.name}`);restore.disabled=true;
          if(player.getAttribute('src')!==item.sourceUrl)player.src=item.sourceUrl;
          player.setAttribute('aria-label',`Escuchar original ${item.file.name}`);
          const complete=items.every(ready);ui.action.textContent=complete?(items.length===1?'Descargar':'Descargar todo'):(items.length===1?'Convertir':'Convertir todo');
          ui.action.classList.toggle('is-download',complete);$('download-area').hidden=!items.some(ready);
          const count=items.filter(ready).length;$('download-heading').textContent=`${count} ${count===1?'audio listo':'audios listos'}`;
        });field.append(input);fields.append(field);
      }
      trim.append(fields);row.append(icon,detail,result,actions,trim);ui.list.append(row);
    }
    const count=items.filter(ready).length;$('download-area').hidden=!count;
    $('download-heading').textContent=`${count} ${count===1?'audio listo':'audios listos'}`;$('download-caption').textContent='La extensión corresponde al formato elegido.';
  }
  function addFiles(files){
    if(busy||archiving)return;let rejected=0;
    for(const file of files){
      const ext=file.name.split('.').pop().toLowerCase();
      if(!file.size||file.size>256*1048576||!(file.type.startsWith('audio/')||file.type.startsWith('video/')||/^(mp3|wav|flac|ogg|oga|opus|m4a|aac|aif|aiff|wma|mp4|webm|mkv|mov|avi|amr|caf|ac3)$/.test(ext))){rejected++;continue;}
      items.push({id:++serial,file,ext,sourceUrl:URL.createObjectURL(file),status:'pending',start:'0',end:''});
    }
    $('progress-block').hidden=true;render();if(rejected)notice(`${rejected} archivo(s) omitidos. Usa audio o video de hasta 256 MB por archivo.`,true);
  }
  async function convertItems(id=null){
    if(busy||archiving)return;const pending=items.filter(item=>!ready(item)&&(id===null||id===item.id));if(!pending.length)return;
    busy=true;cancelled=false;ui.cancel.disabled=false;let done=0,failures=0;render();
    for(const item of pending){
      if(cancelled)break;item.status='working';render();progress(done/pending.length*100,`Preparando ${item.file.name}`);await tick();
      try{
        if(cancelled){item.status='pending';break;}
        const start=Number(item.start===''||item.start==null?0:item.start),end=item.end===''||item.end==null?null:Number(item.end);
        if(!Number.isFinite(start)||start<0||(end!==null&&(!Number.isFinite(end)||end<=start)))throw Error('Revisa el recorte: el fin debe ser posterior al inicio.');
        const format=target(item);
        progress(done/pending.length*100,`Cargando motor · ${item.file.name}`);
        const result=await engine.convert(item.file,{format,bitrate:Number(ui.bitrate.value),sampleRate:Number(ui.sample.value),channels:Number(ui.channels.value),start,end},fraction=>progress((done+fraction)/pending.length*100,`Convirtiendo ${item.file.name}`));
        if(cancelled){item.status='pending';break;}
        item.output=new Blob([result.bytes],{type:mime[format]});item.resultUrl=URL.createObjectURL(item.output);
        Object.assign(item,{format,name:item.file.name.replace(/\.[^.]+$/,'')+`.${format}`,metadata:result.metadata,status:'ready',error:''});
      }catch(error){if(cancelled){item.status='pending';break;}item.status='error';item.error=error.message||'No se pudo convertir';failures++;}
      done++;render();progress(done/pending.length*100,`Convertidos ${done} de ${pending.length}`);
    }
    busy=false;$('progress-block').hidden=true;render();notice(cancelled?'Conversión cancelada.':failures?'Algunos archivos no pudieron convertirse. Revisa sus mensajes.':'Audios listos para descargar.',failures>0);
  }
  async function downloadAll(){
    if(busy||archiving)return;const files=items.filter(ready);if(!files.length)return;
    if(files.length===1){ImanageFiles.saveBlob(files[0].output,files[0].name);return;}
    archiving=true;render();
    try{const zip=await ImanageFiles.createZip(files.map(item=>({name:item.name,blob:item.output,lastModified:item.file.lastModified})),(done,total,label)=>progress(done/total*100,label));ImanageFiles.saveBlob(zip,'Filer-audios.zip');}
    catch(error){notice(error.message,true);}finally{archiving=false;$('progress-block').hidden=true;render();}
  }
  [ui.format,ui.bitrate,ui.sample,ui.channels].forEach(control=>control.addEventListener('change',()=>{
    if(busy||archiving)return;items.filter(item=>control!==ui.format||!item.targetFormat).forEach(reset);$('progress-block').hidden=true;render();
  }));
  ui.input.addEventListener('change',event=>{addFiles(event.target.files);event.target.value='';});
  ui.drop.addEventListener('click',()=>{if(!busy&&!archiving)ui.input.click();});
  ui.drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();ui.drop.click();}});
  ['dragenter','dragover','dragleave','drop'].forEach(name=>ui.drop.addEventListener(name,event=>{event.preventDefault();ui.drop.classList.toggle('is-over',!busy&&!archiving&&['dragenter','dragover'].includes(name));if(name==='drop')addFiles(event.dataTransfer.files);}));
  ui.action.addEventListener('click',()=>items.length&&items.every(ready)?downloadAll():convertItems());
  ui.cancel.addEventListener('click',()=>{cancelled=true;ui.cancel.disabled=true;engine.cancel();});
  ui.clear.addEventListener('click',()=>{if(busy||archiving)return;items.forEach(item=>{reset(item);URL.revokeObjectURL(item.sourceUrl);});items=[];$('progress-block').hidden=true;render();});
  document.querySelector('#au-empty-state .im-empty-icon').innerHTML=noteIcon;
  render();
})();
