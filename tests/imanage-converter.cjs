/* Ejecutar con Node y Playwright instalado (o PLAYWRIGHT_MODULE apuntando al paquete).
   BROWSER_CHANNEL=msedge selecciona Edge; por defecto usa Chromium de Playwright. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try{
    const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    const content=await fs.readFile(file);
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(content);
  }catch(_){res.writeHead(404);res.end();}
});
async function downloadBytes(page,selector){
  const downloaded=page.waitForEvent('download');await page.locator(selector).click();const download=await downloaded;
  const buffer=await fs.readFile(await download.path());return {buffer,name:download.suggestedFilename()};
}
async function waitReady(page){
  await page.waitForFunction(()=>!document.querySelector('#cv-optimize').disabled);
  assert.equal(await page.locator('#cv-file-list .is-error').count(),0,await page.locator('#cv-file-list').innerText());
  assert.match(await page.locator('#cv-optimize').innerText(),/^Descargar/);
}
(async()=>{
  let browser;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/imanage/imanage.html`);
    await page.evaluate(()=>history.replaceState(null,'',location.pathname+'?custom=keep#images'));
    await page.locator('#tab-converter').click();
    assert.equal(new URL(page.url()).searchParams.get('tab'),'convertidor');
    assert.equal(new URL(page.url()).searchParams.get('custom'),'keep');assert.equal(new URL(page.url()).hash,'#images');
    await page.reload();assert.equal(await page.locator('#tab-converter').getAttribute('aria-selected'),'true');
    await page.locator('#tab-compression').click();assert.equal(new URL(page.url()).searchParams.get('tab'),'compresion');
    await page.goBack();assert.equal(await page.locator('#tab-converter').getAttribute('aria-selected'),'true');
    await page.goForward();assert.equal(await page.locator('#tab-compression').getAttribute('aria-selected'),'true');
    await page.locator('#tab-converter').click();
    const tabWidths=await page.locator('.im-tabs').evaluate(bar=>({bar:bar.clientWidth,widths:[...bar.children].map(tab=>tab.getBoundingClientRect().width)}));
    assert.ok(Math.abs(tabWidths.widths[0]-tabWidths.widths[1])<1);assert.ok(tabWidths.widths[0]>tabWidths.bar*.32);
    const fixture=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#ee4499';ctx.fillRect(16,16,64,32);
      ctx.fillStyle='rgba(30,100,200,.5)';ctx.fillRect(32,20,32,24);
      ctx.fillRect(2,2,8,8);
      return [...new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve))).arrayBuffer())];
    });
    const upload=(name,buffer=Buffer.from(fixture),mimeType='image/png')=>page.locator('#cv-file-input').setInputFiles({name,buffer,mimeType});
    await upload('Prueba.png');
    const results={};
    for(const format of ['png','jpg','webp','ico','bmp','gif','tiff','svg']){
      await page.selectOption('#cv-format',format);await page.locator('#cv-optimize').click();await waitReady(page);
      const output=await downloadBytes(page,'#cv-optimize');assert.equal(output.name,`Prueba.${format}`);results[format]=output.buffer;
      assert.equal(await page.locator('#cv-file-list .im-item-primary').textContent(),'');
      assert.equal(await page.locator('#cv-file-list .im-item-primary svg').count(),1);
      assert.equal(await page.locator('#cv-optimize svg').count(),1);
    }
    assert.equal(results.png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(results.jpg.subarray(0,3).toString('hex'),'ffd8ff');
    assert.equal(results.webp.subarray(0,4).toString(),'RIFF');assert.equal(results.webp.subarray(8,12).toString(),'WEBP');
    assert.equal(results.ico.readUInt16LE(2),1);assert.equal(results.ico.readUInt16LE(4),6);
    for(let i=0;i<6;i++){const offset=results.ico.readUInt32LE(6+i*16+12);assert.equal(results.ico.subarray(offset,offset+8).toString('hex'),'89504e470d0a1a0a');}
    assert.equal(results.bmp.subarray(0,2).toString(),'BM');assert.equal(results.gif.subarray(0,6).toString(),'GIF89a');
    assert.ok(['49492a00','4d4d002a'].includes(results.tiff.subarray(0,4).toString('hex')));
    assert.match(results.svg.toString(),/<svg /);assert.match(results.svg.toString(),/data:image\/png;base64,/);
    const tiffAlpha=await page.evaluate(bytes=>UTIF.decode(new Uint8Array(bytes).buffer)[0].t338[0],[...results.tiff]);
    assert.equal(tiffAlpha,2,'TIFF alpha must be tagged as unassociated');
    // Volver a PNG desde cada salida prueba también los decodificadores de entrada.
    const mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp',ico:'image/x-icon',bmp:'image/bmp',gif:'image/gif',tiff:'image/tiff',svg:'image/svg+xml'};
    for(const [format,buffer] of Object.entries(results)){
      await page.locator('#cv-clear').click();await page.selectOption('#cv-format','png');
      await upload(`Entrada.${format}`,buffer,mime[format]);await page.locator('#cv-optimize').click();await waitReady(page);
      const output=await downloadBytes(page,'#cv-optimize');assert.equal(output.buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      const decoded=await page.evaluate(async bytes=>{
        const image=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
        return {width:image.width,height:image.height,corner:[...ctx.getImageData(image.width-1,image.height-1,1,1).data]};
      },[...output.buffer]);
      assert.equal(decoded.width,format==='ico'?256:96);
      assert.equal(decoded.height,format==='ico'?256:64);
      assert.equal(decoded.corner[3],['jpg','bmp'].includes(format)?255:0,`${format} transparency`);
      if(['jpg','bmp'].includes(format))assert.ok(decoded.corner.slice(0,3).every(value=>value>=250));
    }
    // TIFF externo con alpha premultiplicado y orientación EXIF 6 (90°).
    const rotatedTiff=await page.evaluate(()=>[...new Uint8Array(UTIF.encodeImage(new Uint8Array([64,32,16,128,255,255,255,255]).buffer,2,1,{t338:[1],t274:[6]}))]);
    await page.locator('#cv-clear').click();await upload('Rotado.tiff',Buffer.from(rotatedTiff),'image/tiff');await page.locator('#cv-optimize').click();await waitReady(page);
    const oriented=await downloadBytes(page,'#cv-optimize');
    const orientedPixels=await page.evaluate(async bytes=>{const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,rgba:[...ctx.getImageData(0,0,1,1).data]};},[...oriented.buffer]);
    assert.deepEqual([orientedPixels.width,orientedPixels.height],[1,2]);
    [128,64,32,128].forEach((value,i)=>assert.ok(Math.abs(orientedPixels.rgba[i]-value)<=2));
    // Dos nombres iguales se resuelven al empaquetar el lote.
    await page.locator('#cv-clear').click();await page.selectOption('#cv-format','jpg');
    await page.locator('#cv-file-input').setInputFiles([{name:'Duplicado.png',buffer:Buffer.from(fixture),mimeType:'image/png'},{name:'Duplicado.png',buffer:Buffer.from(fixture),mimeType:'image/png'}]);
    await page.locator('#cv-file-list .im-item-primary').first().click();
    await page.waitForFunction(()=>document.querySelector('#cv-file-list .im-item-primary').classList.contains('is-download'));
    assert.equal(await page.locator('#cv-file-list .im-item-primary').nth(1).textContent(),'Convertir');
    await page.locator('#cv-optimize').click();await waitReady(page);
    const zip=await downloadBytes(page,'#cv-optimize');const names=[];let at=0;
    while(zip.buffer.readUInt32LE(at)===0x04034b50){const length=zip.buffer.readUInt32LE(at+18),n=zip.buffer.readUInt16LE(at+26),extra=zip.buffer.readUInt16LE(at+28);names.push(zip.buffer.subarray(at+30,at+30+n).toString());at+=30+n+extra+length;}
    assert.deepEqual(names,['Duplicado.jpg','Duplicado (2).jpg']);
    await page.waitForFunction(()=>!document.querySelector('#cv-optimize').disabled);
    // Una excepción por imagen se respeta dentro de un mismo lote.
    await page.locator('#cv-file-list .im-item-format').first().selectOption('webp');
    assert.equal(await page.locator('#cv-file-list .im-item-primary').first().textContent(),'Convertir');
    assert.match(await page.locator('#cv-file-list .im-item-primary').nth(1).getAttribute('aria-label'),/^Descargar /);
    await page.locator('#cv-optimize').click();await waitReady(page);
    const mixedZip=await downloadBytes(page,'#cv-optimize');const mixedNames=[];at=0;
    while(mixedZip.buffer.readUInt32LE(at)===0x04034b50){const length=mixedZip.buffer.readUInt32LE(at+18),n=mixedZip.buffer.readUInt16LE(at+26),extra=mixedZip.buffer.readUInt16LE(at+28);mixedNames.push(mixedZip.buffer.subarray(at+30,at+30+n).toString());at+=30+n+extra+length;}
    assert.deepEqual(mixedNames,['Duplicado.webp','Duplicado.jpg']);
    await page.waitForFunction(()=>!document.querySelector('#cv-optimize').disabled);
    await page.selectOption('#cv-format','png');
    assert.match(await page.locator('#cv-file-list .im-item-primary').first().getAttribute('aria-label'),/^Descargar /);
    assert.equal(await page.locator('#cv-file-list .im-item-primary').nth(1).textContent(),'Convertir');
    assert.equal(await page.locator('#cv-file-list .im-item-format').first().inputValue(),'webp');
    await page.locator('#cv-file-list .im-item-format').first().selectOption('ico');
    assert.ok(await page.locator('#cv-ico-control').isVisible());
    await page.locator('#cv-optimize').click();await waitReady(page);
    const mixedIcon=await downloadBytes(page,'#cv-file-list .im-item-primary >> nth=0');
    assert.equal(mixedIcon.name,'Duplicado.ico');assert.equal(mixedIcon.buffer.readUInt16LE(2),1);
    await page.locator('#cv-file-list .im-item-format').first().selectOption('');
    assert.equal(await page.locator('#cv-file-list .im-item-format').first().inputValue(),'');
    await page.locator('#cv-optimize').click();await waitReady(page);
    await page.locator('#cv-file-list .reset').first().click();assert.equal(await page.locator('#cv-file-list .im-item-primary').first().textContent(),'Convertir');
    // Los tabs conservan archivos independientes.
    await page.locator('#tab-compression').click();assert.equal(await page.locator('#files-count').textContent(),'0');
    await page.locator('#file-input').setInputFiles({name:'Comprimir.png',buffer:Buffer.from(fixture),mimeType:'application/octet-stream'});
    assert.equal(await page.locator('#files-count').textContent(),'1','Valid PNG with generic MIME must not be rejected');
    await page.locator('#optimize').click();await page.waitForFunction(()=>document.querySelector('#optimize').textContent==='Descargar');
    assert.equal(await page.locator('#file-list .im-item-primary').textContent(),'');
    assert.equal(await page.locator('#file-list .im-item-primary svg').count(),1);
    assert.equal(await page.locator('#optimize svg').count(),1);
    const compressed=await downloadBytes(page,'#optimize');assert.equal(compressed.name,'Comprimir.png');
    await page.locator('#tab-converter').click();assert.equal(await page.locator('#cv-files-count').textContent(),'2');
    // Mensajes claros para archivos corruptos y reintento sin bloquear la lista.
    await page.locator('#cv-clear').click();await upload('Corrupta.png',Buffer.from('invalid'),'image/png');
    await page.locator('#cv-optimize').click();await page.waitForFunction(()=>document.querySelector('#cv-file-list .im-item-primary').textContent==='Reintentar');
    assert.ok(await page.locator('#cv-file-list .is-error').count());
    await page.locator('#cv-clear').click();await upload('Icono.png');await page.selectOption('#cv-format','ico');await page.selectOption('#cv-ico-size','32');
    await page.locator('#cv-optimize').click();await waitReady(page);
    const icon=await downloadBytes(page,'#cv-optimize');assert.equal(icon.buffer.readUInt16LE(4),1);assert.equal(icon.buffer[6],32);
    // Fondo elegido para JPEG, sin tomar el original aunque el resultado sea más grande.
    await page.selectOption('#cv-format','jpg');await page.locator('#cv-background').fill('#00ff00');await page.locator('#cv-background').dispatchEvent('change');
    await page.locator('#cv-optimize').click();await waitReady(page);
    const green=await downloadBytes(page,'#cv-optimize');
    const corner=await page.evaluate(async bytes=>{const image=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/jpeg'}));const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return [...ctx.getImageData(0,0,1,1).data];},[...green.buffer]);
    assert.ok(corner[0]<10&&corner[1]>245&&corner[2]<10);
    // Redimensionado conservando proporciones, tanto en tamaño real como en metadatos.
    const large=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;canvas.getContext('2d').fillRect(0,0,1600,1000);return [...new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve))).arrayBuffer())];});
    await page.locator('#cv-clear').click();await upload('Grande.png',Buffer.from(large));await page.selectOption('#cv-format','png');await page.selectOption('#cv-max-size','800');
    await page.locator('#cv-optimize').click();await waitReady(page);
    const small=await downloadBytes(page,'#cv-optimize');assert.equal(small.buffer.readUInt32BE(16),800);assert.equal(small.buffer.readUInt32BE(20),500);
    await page.evaluate(()=>{
      window.__maxCanvasArea=0;window.__canvasDescriptors={};
      for(const name of ['width','height']){const original=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,name);window.__canvasDescriptors[name]=original;Object.defineProperty(HTMLCanvasElement.prototype,name,{...original,set(value){original.set.call(this,value);window.__maxCanvasArea=Math.max(window.__maxCanvasArea,this.width*this.height);}});}
    });
    await page.selectOption('#cv-format','ico');await page.locator('#cv-optimize').click();await waitReady(page);
    assert.ok(await page.evaluate(()=>window.__maxCanvasArea<=256*256),'ICO should not allocate a full-resolution canvas');
    await page.evaluate(()=>{for(const [key,descriptor] of Object.entries(window.__canvasDescriptors))Object.defineProperty(HTMLCanvasElement.prototype,key,descriptor);});
    // Worker lento controlado para comprobar que cancelar detiene la tarea activa.
    await page.route('**/converter-worker.js',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage = () => {};'}));
    await page.selectOption('#cv-format','tiff');await page.locator('#cv-optimize').click();await page.locator('#cv-cancel').click();
    await page.waitForFunction(()=>!document.querySelector('#cv-optimize').disabled);assert.equal(await page.locator('#cv-file-list .im-item-primary').textContent(),'Convertir');
    await page.unroute('**/converter-worker.js');
    // El fallback también funciona al abrir el HTML directamente, sin Worker permitido.
    await page.evaluate(()=>{window.__NativeWorker=window.Worker;window.Worker=function(){throw Error('worker unavailable');};});
    await page.locator('#cv-optimize').click();await waitReady(page);await page.evaluate(()=>{window.Worker=window.__NativeWorker;});
    const layout=await page.evaluate(()=>{const a=document.querySelector('#panel-converter .im-settings-panel').getBoundingClientRect(),b=document.querySelector('#panel-converter .im-upload-panel').getBoundingClientRect();return {left:a.x<b.x,smaller:a.width<b.width};});
    assert.ok(layout.left&&layout.smaller);
    if(process.env.SCREENSHOT_DIR){await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'converter-desktop.png'),fullPage:true});}
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.env.SCREENSHOT_DIR){await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'converter-mobile.png'),fullPage:true});}
    assert.deepEqual(errors,[]);
    console.log('PASS: 8 formatos de salida y lectura, transparencia, ICO multi/individual, ZIP sin colisiones, acciones individuales, reset, errores, fondo, resolución, cancelación, fallback, separación de tabs, compresor y responsive.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
