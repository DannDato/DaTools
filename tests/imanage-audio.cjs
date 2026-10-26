// Node + Playwright. PLAYWRIGHT_MODULE y BROWSER_CHANNEL permiten usar la instalación local.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    const data=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);
  }catch(_){res.writeHead(404);res.end();}
});
function wav(){
  const rate=44100,frames=rate,bytes=Buffer.alloc(44+frames*4);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*4,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*4,40);
  for(let i=0;i<frames;i++){const sample=Math.round(Math.sin(i*440*2*Math.PI/rate)*10000);bytes.writeInt16LE(sample,44+i*4);bytes.writeInt16LE(sample,46+i*4);}return bytes;
}
async function output(page,selector='#au-optimize'){
  const downloaded=page.waitForEvent('download');await page.locator(selector).click();const result=await downloaded;return {name:result.suggestedFilename(),bytes:await fs.readFile(await result.path())};
}
async function ready(page){
  await page.waitForFunction(()=>!document.querySelector('#au-optimize').disabled,{},{timeout:120000});
  assert.equal(await page.locator('#au-file-list .is-error').count(),0,(await page.locator('#au-file-list').innerText())+'\n'+await page.evaluate(()=>JSON.stringify(window.__audioLogs||[])));
  assert.match(await page.locator('#au-optimize').textContent(),/^Descargar/);
}
(async()=>{
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    await page.goto(`http://127.0.0.1:${server.address().port}/imanage/imanage.html`);
    assert.deepEqual(await page.locator('[role=tab]').allTextContents(),['Compresor de imágenes','Convertidor de imágenes','Convertidor de audio']);
    await page.locator('#tab-audio').click();assert.equal(new URL(page.url()).searchParams.get('tab'),'audio');
    await page.reload();assert.equal(await page.locator('#tab-audio').getAttribute('aria-selected'),'true');
    await page.evaluate(()=>{const original=ImanageAudioEngine.prototype.load,seen=new WeakSet();window.__audioLogs=[];ImanageAudioEngine.prototype.load=async function(){const ffmpeg=await original.call(this);if(!seen.has(ffmpeg)){seen.add(ffmpeg);ffmpeg.on('log',({message})=>{window.__audioLogs.push(message);if(window.__audioLogs.length>20)window.__audioLogs.shift();});}return ffmpeg;};});
    assert.ok(!requests.some(url=>url.includes('ffmpeg-core')),'FFmpeg must load lazily');
    const upload=(name,bytes=wav(),mimeType='audio/wav')=>page.locator('#au-file-input').setInputFiles({name,buffer:bytes,mimeType});
    await upload('Prueba.wav');const formats={mp3:'audio/mpeg',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',opus:'audio/ogg',m4a:'audio/mp4'},results={};
    // Cancelar antes de que llegue el script del motor debe desbloquear la interfaz.
    let heldScript;
    await page.route('**/vendor/ffmpeg/ffmpeg.js',route=>{heldScript=route;});
    const scriptRequested=page.waitForRequest(request=>request.url().endsWith('/vendor/ffmpeg/ffmpeg.js'));
    await page.locator('#au-optimize').click();await scriptRequested;
    await page.locator('#au-cancel').click();await page.waitForFunction(()=>!document.querySelector('#au-optimize').disabled);
    assert.equal(await page.locator('#au-file-list .im-item-primary').textContent(),'Convertir');
    await heldScript.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'imanage/vendor/ffmpeg/ffmpeg.js'),'utf8')});
    await page.unroute('**/vendor/ffmpeg/ffmpeg.js');
    for(const format of Object.keys(formats)){
      await page.selectOption('#au-format',format);await page.locator('#au-optimize').click();await ready(page);
      const result=await output(page);assert.equal(result.name,`Prueba.${format}`);results[format]=result.bytes;
      assert.match(await page.locator('#au-file-list .im-file-meta').textContent(),/kHz/);
      assert.equal(await page.locator('#au-file-list .im-item-primary').textContent(),'');assert.equal(await page.locator('#au-optimize svg').count(),1);
      const player=page.locator('#au-file-list audio');assert.ok((await player.getAttribute('src')).startsWith('blob:'));
    }
    assert.equal(results.wav.subarray(0,4).toString(),'RIFF');assert.equal(results.flac.subarray(0,4).toString(),'fLaC');assert.equal(results.ogg.subarray(0,4).toString(),'OggS');assert.equal(results.opus.subarray(0,4).toString(),'OggS');assert.equal(results.m4a.subarray(4,8).toString(),'ftyp');assert.ok(results.mp3.subarray(0,3).toString()==='ID3'||results.mp3[0]===255);
    for(const [format,bytes] of Object.entries(results)){
      await page.locator('#au-clear').click();await page.selectOption('#au-format','wav');await upload(`Entrada.${format}`,bytes,formats[format]);await page.locator('#au-optimize').click();await ready(page);
      const result=await output(page);assert.equal(result.bytes.subarray(0,4).toString(),'RIFF');
    }
    // Excepciones por fila y ZIP mixto.
    await page.locator('#au-clear').click();await page.selectOption('#au-format','mp3');
    await page.locator('#au-file-input').setInputFiles([{name:'Uno.wav',buffer:wav(),mimeType:'audio/wav'},{name:'Dos.wav',buffer:wav(),mimeType:'audio/wav'}]);
    await page.locator('#au-file-list .im-item-format').nth(1).selectOption('flac');await page.locator('#au-optimize').click();await ready(page);
    const zip=await output(page);let at=0;const names=[];while(zip.bytes.readUInt32LE(at)===0x04034b50){const length=zip.bytes.readUInt32LE(at+18),n=zip.bytes.readUInt16LE(at+26),extra=zip.bytes.readUInt16LE(at+28);names.push(zip.bytes.subarray(at+30,at+30+n).toString());at+=30+n+extra+length;}
    assert.deepEqual(names,['Uno.mp3','Dos.flac']);await page.waitForFunction(()=>!document.querySelector('#au-optimize').disabled);
    await page.selectOption('#au-format','wav');assert.match(await page.locator('#au-file-list .im-item-primary').nth(1).getAttribute('aria-label'),/^Descargar/);
    // Recorte, mono y frecuencia elegida.
    await page.locator('#au-clear').click();await upload('Recorte.wav');await page.selectOption('#au-channels','1');await page.selectOption('#au-sample-rate','22050');
    await page.locator('#au-file-list summary').click();await page.getByRole('spinbutton',{name:'Inicio (segundos) de Recorte.wav'}).fill('0.2');await page.getByRole('spinbutton',{name:'Inicio (segundos) de Recorte.wav'}).press('Tab');
    await page.getByRole('spinbutton',{name:'Fin (opcional) de Recorte.wav'}).fill('0.7');await page.getByRole('spinbutton',{name:'Fin (opcional) de Recorte.wav'}).press('Tab');
    await page.locator('#au-optimize').click();await ready(page);const trimmed=await output(page);
    let fmt=12,channelCount,rate,dataLength;while(fmt+8<trimmed.bytes.length){const id=trimmed.bytes.subarray(fmt,fmt+4).toString(),length=trimmed.bytes.readUInt32LE(fmt+4);if(id==='fmt '){channelCount=trimmed.bytes.readUInt16LE(fmt+10);rate=trimmed.bytes.readUInt32LE(fmt+12);}if(id==='data')dataLength=length;fmt+=8+length+(length%2);}
    assert.equal(channelCount,1);assert.equal(rate,22050);assert.ok(Math.abs(dataLength/(rate*2)-.5)<.03);
    await page.getByRole('spinbutton',{name:'Inicio (segundos) de Recorte.wav'}).fill('10');await page.getByRole('spinbutton',{name:'Inicio (segundos) de Recorte.wav'}).press('Tab');
    await page.getByRole('spinbutton',{name:'Fin (opcional) de Recorte.wav'}).fill('11');await page.getByRole('spinbutton',{name:'Fin (opcional) de Recorte.wav'}).press('Tab');
    await page.locator('#au-optimize').click();await page.waitForFunction(()=>!document.querySelector('#au-optimize').disabled);assert.match(await page.locator('#au-file-list .is-error').textContent(),/fuera de la duración/);
    // Video con una pista de audio, producido localmente con el mismo motor.
    const video=await page.evaluate(async()=>{const engine=new ImanageAudioEngine(),ffmpeg=await engine.load();const code=await ffmpeg.exec(['-f','lavfi','-i','color=c=blue:s=64x64:r=5','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','test.mp4']);if(code)throw Error('video fixture failed');const bytes=await ffmpeg.readFile('test.mp4');engine.cancel();return [...bytes];});
    await page.locator('#au-clear').click();await upload('Video.mp4',Buffer.from(video),'video/mp4');await page.locator('#au-optimize').click();await ready(page);assert.equal((await output(page)).name,'Video.wav');
    // Corruptos, recortes inválidos y cancelación con posterior reintento.
    await page.locator('#au-clear').click();await upload('Roto.mp3',Buffer.from('invalid'),'audio/mpeg');await page.locator('#au-optimize').click();await page.waitForFunction(()=>document.querySelector('#au-file-list .im-item-primary').textContent==='Reintentar');
    await page.locator('#au-clear').click();await upload('Cancelar.wav');await page.selectOption('#au-format','mp3');await page.locator('#au-optimize').click();await page.locator('#au-cancel').click();await page.waitForFunction(()=>!document.querySelector('#au-optimize').disabled);assert.equal(await page.locator('#au-file-list .im-item-primary').textContent(),'Convertir');
    await page.locator('#au-optimize').click();await ready(page);
    // Editar tiempos no debe reemplazar el botón durante el clic ni perder el foco.
    await page.locator('#au-file-list summary').click();
    const startInput=page.getByRole('spinbutton',{name:'Inicio (segundos) de Cancelar.wav'});
    await startInput.fill('0.1');assert.ok(await startInput.evaluate(node=>node===document.activeElement));
    await page.locator('#au-optimize').click();await ready(page);
    // Combinación antes rechazada por Vorbis: mono, 22.05 kHz y calidad máxima.
    await page.selectOption('#au-format','ogg');await page.selectOption('#au-bitrate','320');
    await page.locator('#au-optimize').click();await ready(page);assert.equal((await output(page)).bytes.subarray(0,4).toString(),'OggS');
    await page.locator('#tab-converter').click();assert.equal(await page.locator('#cv-files-count').textContent(),'0');await page.locator('#tab-audio').click();assert.equal(await page.locator('#au-files-count').textContent(),'1');
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'audio-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'audio-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS: carga diferida, 6 salidas y lecturas reales, recorte, mono/frecuencia, audio desde MP4, ZIP mixto, errores, cancelación/reintento, iconos, URL y responsive.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
