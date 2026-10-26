/* Convertidor local. Cada salida tiene bytes y extensión de su formato real. */
(() => {
  'use strict';
  const $=id=>document.getElementById(`cv-${id}`);
  const ui={input:$('file-input'),drop:$('dropzone'),format:$('format'),quality:$('quality'),
    max:$('max-size'),ico:$('ico-size'),background:$('background'),list:$('file-list'),
    empty:$('empty-state'),count:$('files-count'),action:$('optimize'),clear:$('clear'),cancel:$('cancel')};
  const mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp',ico:'image/x-icon',bmp:'image/bmp',gif:'image/gif',tiff:'image/tiff',svg:'image/svg+xml'};
  const workerUrl=new URL('converter-worker.js',document.currentScript.src);
  const resetIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg>';
  const removeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 3h4m-8 4 1 14h10l1-14M10 11v6m4-6v6"/></svg>';
  let items=[],serial=0,busy=false,archiving=false,cancelled=false,cancelJob=null,toastTimer;
  const ready=item=>item.status==='ready';
  const targetFormat=item=>item.targetFormat||ui.format.value;
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  function size(bytes){return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(2)} MB`;}
  function notice(message,error=false){
    const toast=document.getElementById('toast');clearTimeout(toastTimer);
    toast.textContent=message;toast.classList.toggle('is-error',error);toast.classList.add('is-visible');
    toastTimer=setTimeout(()=>toast.classList.remove('is-visible'),4700);
  }
  function reset(item){
    if(item.resultPreview)URL.revokeObjectURL(item.resultPreview);
    Object.assign(item,{output:null,resultPreview:null,status:'pending',error:'',width:null,height:null});
  }
  function progress(done,total,label){
    $('progress-block').hidden=false;const percent=total?Math.round(done/total*100):0;
    $('progress-label').textContent=label;$('progress-percent').textContent=`${percent}%`;
    $('progress-fill').style.width=`${percent}%`;$('progress-track').setAttribute('aria-valuenow',String(percent));
  }
  function button(label,className,onClick,disabled=false,icon=null){
    const b=document.createElement('button');b.type='button';b.className=className;b.disabled=disabled;
    b.title=label;b.setAttribute('aria-label',label);if(icon)b.innerHTML=icon;else b.textContent=label;
    b.addEventListener('click',onClick);return b;
  }
  function render(){
    updateControls();
    const locked=busy||archiving,complete=items.length>0&&items.every(ready);
    ui.input.disabled=locked;
    [ui.format,ui.quality,ui.max,ui.ico,ui.background].forEach(control=>control.disabled=locked);
    ui.drop.classList.toggle('is-disabled',locked);ui.drop.setAttribute('aria-disabled',String(locked));
    ui.clear.disabled=locked||!items.length;ui.action.disabled=locked||!items.length;
    ui.action.textContent=archiving?'Creando ZIP…':busy?'Convirtiendo…':complete?(items.length===1?'Descargar':'Descargar todo'):(items.length===1?'Convertir':'Convertir todo');
    ui.action.classList.toggle('is-download',complete);ui.cancel.hidden=!busy;
    if(complete&&!locked)ImanageFiles.decorateDownload(ui.action);
    ui.empty.hidden=items.length>0;ui.count.textContent=String(items.length);ui.list.replaceChildren();
    for(const item of items){
      const row=document.createElement('article');row.className='im-file';
      let thumb;
      if(item.resultPreview||!['tif','tiff'].includes(item.ext)){
        thumb=document.createElement('img');thumb.src=item.resultPreview||item.preview;thumb.alt='';thumb.loading='lazy';
        thumb.addEventListener('error',()=>{thumb.hidden=true;},{once:true});
      }else{thumb=document.createElement('span');thumb.textContent='TIFF';}
      thumb.className='im-thumb';
      const detail=document.createElement('div');detail.className='im-file-detail';
      const name=document.createElement('div');name.className='im-file-name';name.textContent=item.file.name;name.title=item.file.name;
      const meta=document.createElement('div');meta.className='im-file-meta';
      meta.textContent=`${item.ext.toUpperCase()} · ${size(item.file.size)}${ready(item)?` → ${item.format.toUpperCase()} · ${item.width} × ${item.height} px`:''}`;
      detail.append(name,meta);
      const result=document.createElement('div');result.className='im-file-status';
      const weight=document.createElement('span');weight.className='im-file-size';
      weight.textContent=ready(item)?`${size(item.file.size)} → ${size(item.output.size)}`:size(item.file.size);
      const status=document.createElement('span');status.className='im-file-status-text';
      status.textContent=ready(item)?`Listo · ${item.name}`:item.status==='working'?'Convirtiendo…':item.status==='error'?item.error:'Pendiente de convertir';
      if(item.status==='error')status.classList.add('is-error');else if(ready(item))status.classList.add('is-saved');
      status.title=status.textContent;result.append(weight,status);
      const actions=document.createElement('div');actions.className='im-row-actions';
      const formatSelect=document.createElement('select');formatSelect.className='im-item-format';
      formatSelect.setAttribute('aria-label',`Formato de salida de ${item.file.name}`);formatSelect.disabled=locked;
      const inherit=document.createElement('option');inherit.value='';inherit.textContent=`General · ${ui.format.value.toUpperCase()}`;
      formatSelect.append(inherit);
      for(const option of ui.format.options)formatSelect.append(option.cloneNode(true));
      formatSelect.value=item.targetFormat||'';
      formatSelect.addEventListener('change',()=>{
        item.targetFormat=formatSelect.value;reset(item);$('progress-block').hidden=true;render();
        ui.list.querySelectorAll('.im-item-format')[items.indexOf(item)]?.focus();
      });
      const restore=button(`Restablecer ${item.file.name}`,'im-file-action reset',()=>{reset(item);render();},locked||item.status==='pending',resetIcon);
      const label=ready(item)?'Descargar':item.status==='error'?'Reintentar':item.status==='working'?'Convirtiendo…':'Convertir';
      const action=button(label,'im-file-action im-item-primary',()=>ready(item)?ImanageFiles.saveBlob(item.output,item.name):convertItems(item.id),locked);
      action.setAttribute('aria-label',`${label} ${item.file.name}`);action.classList.toggle('is-download',ready(item));
      if(ready(item))ImanageFiles.decorateDownload(action,true);
      const remove=button(`Quitar ${item.file.name}`,'im-file-action remove',()=>{
        reset(item);URL.revokeObjectURL(item.preview);items=items.filter(other=>other!==item);render();
      },locked,removeIcon);
      actions.append(formatSelect,restore,action,remove);row.append(thumb,detail,result,actions);ui.list.append(row);
    }
    const finished=items.filter(ready);$('download-area').hidden=!finished.length;
    $('download-heading').textContent=`${finished.length} ${finished.length===1?'imagen lista':'imágenes listas'}`;
    $('download-caption').textContent='La extensión corresponde al formato elegido.';
  }
  function settingsChanged(control){
    if(busy||archiving)return;
    items.filter(item=>control!==ui.format||!item.targetFormat).forEach(reset);
    $('progress-block').hidden=true;render();
  }
  function updateControls(){
    const format=ui.format.value;
    const formats=new Set([format,...items.map(targetFormat)]);
    $('quality-control').hidden=![...formats].some(f=>['jpg','webp','gif'].includes(f));
    $('ico-control').hidden=!formats.has('ico');
    const onlyIcons=[...formats].every(f=>f==='ico');
    ui.max.parentElement.querySelector('label[for="cv-max-size"]').hidden=onlyIcons;ui.max.hidden=onlyIcons;
    $('background-control').hidden=![...formats].some(f=>['jpg','bmp','gif'].includes(f));
    const hints={png:'Conserva la transparencia y los colores.',jpg:'Sin transparencia. Las zonas transparentes usan el fondo elegido.',webp:'Conserva transparencia; la calidad ajusta la pérdida de detalle.',ico:'Icono cuadrado con transparencia. La imagen se ajusta sin deformarse.',bmp:'Sin transparencia. El resultado puede pesar más que el original.',gif:'Imagen fija de hasta 256 colores; transparencia sin tonos intermedios.',tiff:'TIFF con compresión sin pérdidas y transparencia.',svg:'Imagen PNG incrustada en SVG; no vectoriza ni crea trazos.'};
    $('format-hint').textContent=hints[format];
    $('quality-value').value=`${ui.quality.value}%`;
    ui.quality.style.setProperty('--fill',`${(ui.quality.value-10)/90*100}%`);
  }
  function addFiles(files){
    if(busy||archiving)return;
    let omitted=0;
    for(const file of files){
      const ext=file.name.split('.').pop().toLowerCase();
      if(!file.size||!(file.type.startsWith('image/')||/^(png|apng|jpg|jpeg|jfif|webp|ico|bmp|gif|tif|tiff|svg|avif)$/.test(ext))){omitted++;continue;}
      items.push({id:++serial,file,ext,preview:URL.createObjectURL(file),status:'pending'});
    }
    $('progress-block').hidden=true;render();if(omitted)notice(`${omitted} archivo(s) omitidos: no son imágenes reconocidas.`,true);
  }
  function checkDimensions(width,height){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width*height>40_000_000)throw Error('Resolución no admitida (máximo 40 megapíxeles).');
  }
  async function decode(file,ext){
    if(['tif','tiff'].includes(ext)){
      const buffer=await file.arrayBuffer(),pages=UTIF.decode(buffer),page=pages.find(p=>p.t256&&p.t257);
      if(!page)throw Error('No se encontró una página TIFF válida.');
      checkDimensions(Number(page.t256[0]),Number(page.t257[0]));UTIF.decodeImage(buffer,page,pages);
      const rgba=new Uint8ClampedArray(UTIF.toRGBA8(page));
      if(page.t262?.[0]===2&&page.t338?.[0]===1){
        for(let i=0;i<rgba.length;i+=4)for(let c=0;c<3;c++)rgba[i+c]=rgba[i+3]?Math.round(rgba[i+c]*255/rgba[i+3]):0;
      }
      const canvas=document.createElement('canvas');canvas.width=page.width;canvas.height=page.height;
      canvas.getContext('2d').putImageData(new ImageData(rgba,page.width,page.height),0,0);
      const orientation=Number(page.t274?.[0]||1);
      if(orientation<2||orientation>8)return canvas;
      const oriented=document.createElement('canvas'),w=page.width,h=page.height;
      oriented.width=orientation>=5?h:w;oriented.height=orientation>=5?w:h;
      const transforms={2:[-1,0,0,1,w,0],3:[-1,0,0,-1,w,h],4:[1,0,0,-1,0,h],5:[0,1,1,0,0,0],6:[0,1,-1,0,h,0],7:[0,-1,-1,0,h,w],8:[0,-1,1,0,0,w]};
      const ctx=oriented.getContext('2d');ctx.setTransform(...transforms[orientation]);ctx.drawImage(canvas,0,0);canvas.width=canvas.height=0;
      return oriented;
    }
    if(typeof createImageBitmap==='function'){try{return await createImageBitmap(file);}catch(_){/* SVG/ICO pueden requerir Image. */}}
    const url=URL.createObjectURL(file);
    try{
      return await new Promise((resolve,reject)=>{
        const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('No se pudo leer esta imagen. El formato puede no ser compatible con este navegador.'));image.src=url;
      });
    }finally{URL.revokeObjectURL(url);}
  }
  async function nativeBlob(canvas,type,quality){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,quality));
    if(!blob||blob.type!==type)throw Error(`Este navegador no puede generar ${type.replace('image/','').toUpperCase()}.`);
    return blob;
  }
  function encodeRaw(canvas,settings){
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.buffer;
    const request={pixels,width:canvas.width,height:canvas.height,...settings};
    return new Promise((resolve,reject)=>{
      let worker,settled=false;
      const finish=(error,buffer)=>{if(settled)return;settled=true;if(worker)worker.terminate();cancelJob=null;error?reject(error):resolve(new Blob([buffer],{type:mime[settings.format]}));};
      const fallback=async()=>{if(worker)worker.terminate();await tick();if(settled)return;try{finish(null,ImanageCodecs.encode(request));}catch(e){finish(e);}};
      cancelJob=()=>finish(Error('Conversión cancelada.'));
      try{worker=new Worker(workerUrl);worker.onmessage=event=>event.data.error?finish(Error(event.data.error)):finish(null,event.data.buffer);worker.onerror=event=>{event.preventDefault();fallback();};worker.postMessage(request);}
      catch(_){fallback();}
    });
  }
  async function encodeIco(image,width,height){
    const sizes=ui.ico.value==='multi'?[16,32,48,64,128,256]:[Number(ui.ico.value)];
    const blobs=[];
    for(const size of sizes){
      if(cancelled)throw Error('Conversión cancelada.');
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      const scale=Math.min(size/width,size/height),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
      canvas.getContext('2d').drawImage(image,Math.floor((size-w)/2),Math.floor((size-h)/2),w,h);
      blobs.push(await nativeBlob(canvas,'image/png',1));canvas.width=canvas.height=0;
    }
    const header=new Uint8Array(6+16*sizes.length),view=new DataView(header.buffer);
    view.setUint16(2,1,true);view.setUint16(4,sizes.length,true);let offset=header.length;
    sizes.forEach((size,i)=>{const at=6+16*i;view.setUint8(at,size===256?0:size);view.setUint8(at+1,size===256?0:size);view.setUint16(at+4,1,true);view.setUint16(at+6,32,true);view.setUint32(at+8,blobs[i].size,true);view.setUint32(at+12,offset,true);offset+=blobs[i].size;});
    return new Blob([header,...blobs],{type:mime.ico});
  }
  async function convert(item){
    const image=await decode(item.file,item.ext);let canvas;
    try{
      const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;checkDimensions(width,height);
      if(cancelled)throw Error('Conversión cancelada.');
      const format=targetFormat(item),limit=Number(ui.max.value),scale=limit?Math.min(1,limit/Math.max(width,height)):1;
      const iconSize=ui.ico.value==='multi'?256:Number(ui.ico.value);
      canvas=document.createElement('canvas');canvas.width=format==='ico'?iconSize:Math.max(1,Math.round(width*scale));canvas.height=format==='ico'?iconSize:Math.max(1,Math.round(height*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas no disponible.');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      if(format==='jpg'){ctx.fillStyle=ui.background.value;ctx.fillRect(0,0,canvas.width,canvas.height);}
      if(format==='ico'){
        const fit=Math.min(iconSize/width,iconSize/height),w=Math.max(1,Math.round(width*fit)),h=Math.max(1,Math.round(height*fit));
        ctx.drawImage(image,Math.floor((iconSize-w)/2),Math.floor((iconSize-h)/2),w,h);
      }else ctx.drawImage(image,0,0,canvas.width,canvas.height);
      let output;
      if(format==='ico')output=await encodeIco(image,width,height);
      else if(['png','jpg','webp'].includes(format))output=await nativeBlob(canvas,mime[format],Number(ui.quality.value)/100);
      else if(format==='svg'){
        const png=canvas.toDataURL('image/png');
        output=new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="${canvas.width}" height="${canvas.height}" href="${png}"/></svg>`],{type:mime.svg});
      }else output=await encodeRaw(canvas,{format,quality:Number(ui.quality.value),background:ui.background.value});
      const preview=await nativeBlob(canvas,'image/png',1);
      return {output,format,name:item.file.name.replace(/\.[^.]+$/,'')+`.${format}`,width:format==='ico'?(ui.ico.value==='multi'?256:Number(ui.ico.value)):canvas.width,height:format==='ico'?(ui.ico.value==='multi'?256:Number(ui.ico.value)):canvas.height,preview};
    }finally{if(typeof image.close==='function')image.close();if(image instanceof HTMLCanvasElement)image.width=image.height=0;if(canvas)canvas.width=canvas.height=0;}
  }
  async function convertItems(id=null){
    if(busy||archiving)return;const pending=items.filter(item=>!ready(item)&&(id===null||item.id===id));if(!pending.length)return;
    busy=true;cancelled=false;ui.cancel.disabled=false;let done=0,failures=0;render();
    for(const item of pending){
      if(cancelled)break;item.status='working';progress(done,pending.length,`Convirtiendo ${item.file.name}`);render();await tick();
      try{if(cancelled){item.status='pending';break;}const result=await convert(item);if(cancelled){item.status='pending';break;}
        const {preview,...data}=result;Object.assign(item,data,{resultPreview:URL.createObjectURL(preview),status:'ready',error:''});
      }catch(error){if(cancelled){item.status='pending';break;}item.error=error.message||'No se pudo convertir';item.status='error';failures++;}
      done++;progress(done,pending.length,`Convertidas ${done} de ${pending.length}`);render();
    }
    busy=false;$('progress-block').hidden=true;render();notice(cancelled?'Conversión cancelada.':failures?'Algunas imágenes no pudieron convertirse. Revisa sus mensajes.':'Imágenes listas para descargar.',failures>0);
  }
  async function downloadAll(){
    if(busy||archiving)return;const files=items.filter(ready);if(!files.length)return;
    if(files.length===1){ImanageFiles.saveBlob(files[0].output,files[0].name);return;}
    archiving=true;render();
    try{const zip=await ImanageFiles.createZip(files.map(item=>({name:item.name,blob:item.output,lastModified:item.file.lastModified})),progress);ImanageFiles.saveBlob(zip,'Filer-convertidos.zip');}
    catch(error){notice(error.message,true);}finally{archiving=false;$('progress-block').hidden=true;render();}
  }
  ui.input.addEventListener('change',event=>{addFiles(event.target.files);event.target.value='';});
  ui.drop.addEventListener('click',()=>{if(!busy&&!archiving)ui.input.click();});
  ui.drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();ui.drop.click();}});
  ['dragenter','dragover','dragleave','drop'].forEach(name=>ui.drop.addEventListener(name,event=>{
    event.preventDefault();ui.drop.classList.toggle('is-over',!busy&&!archiving&&['dragenter','dragover'].includes(name));if(name==='drop')addFiles(event.dataTransfer.files);
  }));
  [ui.format,ui.quality,ui.max,ui.ico,ui.background].forEach(control=>control.addEventListener('change',()=>settingsChanged(control)));
  ui.quality.addEventListener('input',updateControls);
  ui.action.addEventListener('click',()=>items.length&&items.every(ready)?downloadAll():convertItems());
  ui.cancel.addEventListener('click',()=>{cancelled=true;ui.cancel.disabled=true;if(cancelJob)cancelJob();});
  ui.clear.addEventListener('click',()=>{if(busy||archiving)return;items.forEach(item=>{reset(item);URL.revokeObjectURL(item.preview);});items=[];$('progress-block').hidden=true;render();});
  updateControls();render();
})();
