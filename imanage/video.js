'use strict';
(()=>{
  const $=id=>document.getElementById('vg-'+id),engine=new ImanageVideoGifEngine();
  const settings=['max-size','fps','colors','dither','loop'].map($);
  let items=[],serial=0,busy=false,archiving=false,cancelled=false,toastTimer;
  const ready=item=>item.status==='ready',locked=()=>busy||archiving;
  const bytes=value=>value<1048576?(value/1024).toFixed(1)+' KB':(value/1048576).toFixed(2)+' MB';
  const time=value=>Number.isFinite(value)?value.toFixed(2)+' s':'';
  const resetIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg>';
  const removeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M10 3h4m-8 4 1 14h10l1-14M10 11v6m4-6v6"/></svg>';
  function notice(text,error=false){const toast=document.getElementById('toast');clearTimeout(toastTimer);toast.textContent=text;toast.classList.toggle('is-error',error);toast.classList.add('is-visible');toastTimer=setTimeout(()=>toast.classList.remove('is-visible'),4700);}
  function reset(item){if(item.resultUrl)URL.revokeObjectURL(item.resultUrl);Object.assign(item,{output:null,resultUrl:null,status:'pending',error:''});}
  function progress(value,label){$('progress-block').hidden=false;value=Math.max(0,Math.min(100,Math.round(value)));$('progress-label').textContent=label;$('progress-percent').textContent=value+'%';$('progress-fill').style.width=value+'%';$('progress-track').setAttribute('aria-valuenow',String(value));}
  function button(label,cls,action,icon){const node=document.createElement('button');node.type='button';node.className='im-file-action '+cls;node.setAttribute('aria-label',label);node.title=label;node.disabled=locked();if(icon)node.innerHTML=icon;else node.textContent=label;node.onclick=action;return node;}
  function render(){
    const complete=items.length>0&&items.every(ready);settings.forEach(node=>node.disabled=locked());$('file-input').disabled=locked();$('dropzone').classList.toggle('is-disabled',locked());$('dropzone').setAttribute('aria-disabled',String(locked()));
    $('clear').disabled=locked()||!items.length;$('optimize').disabled=locked()||!items.length;$('cancel').hidden=!busy;$('files-count').textContent=items.length;$('empty-state').hidden=Boolean(items.length);
    const action=$('optimize');action.textContent=archiving?'Creando ZIP…':busy?'Convirtiendo…':complete?(items.length===1?'Descargar':'Descargar todo'):(items.length===1?'Convertir a GIF':'Convertir todo');action.classList.toggle('is-download',complete);if(complete&&!locked())ImanageFiles.decorateDownload(action);
    $('file-list').querySelectorAll('video').forEach(video=>video.pause());
    $('file-list').replaceChildren();
    for(const item of items){
      const row=document.createElement('article');row.className='im-file im-video-file';
      const detail=document.createElement('div');detail.className='im-file-detail';
      const name=document.createElement('div');name.className='im-file-name';name.textContent=item.file.name;name.title=item.file.name;
      const meta=document.createElement('div');meta.className='im-file-meta';meta.textContent=ready(item)?`${bytes(item.file.size)} → GIF · ${item.width} × ${item.height} · ${time(item.duration)}`:bytes(item.file.size);
      const previews=document.createElement('div');previews.className='im-video-previews';
      const video=document.createElement('video');video.controls=true;video.preload='metadata';video.playsInline=true;video.src=item.sourceUrl;video.setAttribute('aria-label','Video original '+item.file.name);
      video.addEventListener('play',()=>document.querySelectorAll('audio,video').forEach(other=>{if(other!==video)other.pause();}));
      video.addEventListener('loadedmetadata',()=>{if(!ready(item)&&Number.isFinite(video.duration))meta.textContent=`${bytes(item.file.size)} · ${video.videoWidth} × ${video.videoHeight} · ${time(video.duration)}`;},{once:true});
      previews.append(video);if(ready(item)){const image=document.createElement('img');image.src=item.resultUrl;image.alt='GIF convertido de '+item.file.name;previews.append(image);}
      detail.append(name,meta,previews);
      const state=document.createElement('div');state.className='im-file-status';const size=document.createElement('span');size.className='im-file-size';size.textContent=ready(item)?bytes(item.output.size):bytes(item.file.size);
      const status=document.createElement('span');status.className='im-file-status-text';status.textContent=item.status==='working'?'Convirtiendo…':item.status==='error'?item.error:ready(item)?'GIF listo':'Pendiente';if(item.status==='error')status.classList.add('is-error');else if(ready(item))status.classList.add('is-saved');state.append(size,status);
      const actions=document.createElement('div');actions.className='im-row-actions';
      const restore=button('Restablecer '+item.file.name,'reset',()=>{reset(item);render();},resetIcon);restore.disabled=locked()||item.status==='pending';
      const primary=button((ready(item)?'Descargar ':item.status==='error'?'Reintentar ':'Convertir ')+item.file.name,'im-item-primary',()=>ready(item)?ImanageFiles.saveBlob(item.output,item.name):convertItems(item.id));primary.textContent=ready(item)?'Descargar':'Convertir';if(ready(item)){primary.classList.add('is-download');ImanageFiles.decorateDownload(primary,true);}
      actions.append(restore,primary,button('Quitar '+item.file.name,'remove',()=>{reset(item);URL.revokeObjectURL(item.sourceUrl);items=items.filter(other=>other!==item);render();},removeIcon));
      const trim=document.createElement('div');trim.className='im-audio-trim-fields im-video-trim';
      for(const [key,label,placeholder] of [['start','Inicio (segundos)','0'],['end','Fin (opcional)','Inicio + 10 s']]){
        const field=document.createElement('label');field.textContent=label;const input=document.createElement('input');input.type='number';input.min='0';input.step='.01';input.value=item[key];input.placeholder=placeholder;input.disabled=locked();input.setAttribute('aria-label',label+' de '+item.file.name);input.title='Si no eliges final, se convierten hasta 10 segundos desde el inicio. Máximo 60 segundos por GIF.';
        input.onchange=()=>{item[key]=input.value;reset(item);render();};field.append(input);trim.append(field);
      }
      row.append(detail,state,actions,trim);$('file-list').append(row);
    }
  }
  function addFiles(files){
    if(locked())return;let added=0,rejected=0;
    for(const file of Array.from(files||[])){
      if(items.some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified))continue;
      if((!file.type.startsWith('video/')&&!/\.(mp4|webm|mov|mkv|avi|m4v|mpeg|mpg|ogv)$/i.test(file.name))||!file.size||file.size>200*1024*1024||items.length>=20||items.reduce((sum,item)=>sum+item.file.size,0)+file.size>500*1024*1024){rejected++;continue;}
      items.push({id:++serial,file,sourceUrl:URL.createObjectURL(file),start:'0',end:'',status:'pending',output:null,resultUrl:null,error:''});added++;
    }
    render();if(rejected)notice('Algunos archivos se omitieron. Usa videos de hasta 200 MB; máximo 20 archivos y 500 MB en la lista.',true);else if(added)notice(`${added} video${added===1?'':'s'} añadido${added===1?'':'s'}.`);
  }
  async function convertItems(id=null){
    if(locked())return;const pending=items.filter(item=>!ready(item)&&(id===null||item.id===id));if(!pending.length)return;
    document.querySelectorAll('#panel-video video').forEach(video=>video.pause());busy=true;cancelled=false;$('cancel').disabled=false;let done=0,failures=0;render();
    for(const item of pending){
      if(cancelled)break;item.status='working';progress(done/pending.length*100,'Preparando '+item.file.name);render();
      try{
        const start=Number(item.start),end=item.end.trim()===''?null:Number(item.end);
        if(!Number.isFinite(start)||start<0||end!==null&&(!Number.isFinite(end)||end<=start))throw Error('Revisa el inicio y final del recorte.');
        const result=await engine.convert(item.file,{start,end,max:Number($('max-size').value),fps:Number($('fps').value),colors:Number($('colors').value),dither:$('dither').value,loop:Number($('loop').value)},value=>{if(!cancelled)progress((done+value)/pending.length*100,'Convirtiendo '+item.file.name);});
        if(cancelled){item.status='pending';break;}
        Object.assign(item,result,{output:new Blob([result.bytes],{type:'image/gif'}),name:item.file.name.replace(/\.[^.]+$/,'')+'.gif',status:'ready',error:''});delete item.bytes;item.resultUrl=URL.createObjectURL(item.output);
      }catch(error){if(cancelled){item.status='pending';break;}item.status='error';item.error=error.message||'No se pudo convertir el video.';failures++;}
      done++;render();
    }
    busy=false;$('progress-block').hidden=true;render();notice(cancelled?'Conversión cancelada.':failures?'Revisa los archivos que no pudieron convertirse.':'GIFs listos para descargar.',failures>0);
  }
  async function downloadAll(){if(locked())return;const files=items.filter(ready);if(!files.length)return;if(files.length===1){ImanageFiles.saveBlob(files[0].output,files[0].name);return;}archiving=true;render();try{const zip=await ImanageFiles.createZip(files.map(item=>({name:item.name,blob:item.output,lastModified:item.file.lastModified})),(done,total,label)=>progress(done/total*100,label));ImanageFiles.saveBlob(zip,'Filer-gifs.zip');}catch(error){notice(error.message,true);}finally{archiving=false;$('progress-block').hidden=true;render();}}
  $('file-input').onchange=event=>{addFiles(event.target.files);event.target.value='';};$('dropzone').onclick=()=>{if(!locked())$('file-input').click();};$('dropzone').onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();$('dropzone').click();}};
  for(const name of ['dragenter','dragover','dragleave','drop'])$('dropzone').addEventListener(name,event=>{event.preventDefault();$('dropzone').classList.toggle('is-over',!locked()&&['dragenter','dragover'].includes(name));if(name==='drop')addFiles(event.dataTransfer.files);});
  settings.forEach(node=>node.onchange=()=>{if(locked())return;items.forEach(reset);$('progress-block').hidden=true;render();});
  $('optimize').onclick=()=>items.length&&items.every(ready)?downloadAll():convertItems();$('cancel').onclick=()=>{cancelled=true;$('cancel').disabled=true;engine.cancel();};$('clear').onclick=()=>{if(locked())return;items.forEach(item=>{reset(item);URL.revokeObjectURL(item.sourceUrl);});items=[];render();};
  render();
})();
