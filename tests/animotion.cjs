// Ejecutar con Node y Playwright; BROWSER_CHANNEL permite usar Edge instalado.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try {
    let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(!path.extname(file))file+='.html';
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    res.end(await fs.readFile(file));
  }catch{res.writeHead(404);res.end();}
});
const fixture={fps:30,resolution:[1440,2560],scenes:[{start:0,end:.6,objects:[
  {type:'text',text:'Prueba',x:.5,y:.3,size:90,color:'#ffffff',enter:'whip',idle:'orbit'},
  {type:'rect',x:.3,y:.5,width:.15,height:.1,color:'#aa98ff'},
  {type:'circle',x:.6,y:.5,size:80,color:'#ffffff'},
  {type:'line',x:.5,y:.6,width:.3,color:'#ffffff'},
  {type:'icon',name:'database',x:.5,y:.7,size:80,color:'#ffffff'},
  {type:'vector',x:.5,y:.8,size:100,color:'#ffffff',shapes:[{kind:'polygon',points:[{x:-1,y:0},{x:0,y:-1},{x:1,y:0}],closed:true,fill:true,strokeWidth:.03}]}
]}]};
(async()=>{
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const origin=`http://127.0.0.1:${server.address().port}`;
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin+'/animotion/animotion');
    const layout=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.anim-dock-card')].map(node=>{
      const r=node.getBoundingClientRect();return [node.dataset.dock,{x:r.x,y:r.y,right:r.right,bottom:r.bottom}];
    })));
    assert.ok(Math.abs(layout.scenes.x-layout.direction.x)<2);
    assert.ok(Math.abs(layout.scenes.right-layout.preview.right)<2);
    assert.ok(Math.abs(layout.scenes.bottom-layout.json.bottom)<2);
    assert.ok(Math.abs(layout.scenes.bottom-layout.appearance.bottom)<2);
    assert.ok(layout.json.y>layout.project.y&&layout.scenes.y>layout.preview.y);
    assert.equal(await page.locator('#srtExample').count(),0);
    assert.equal(await page.locator('#jsonText').inputValue(),'');
    assert.ok(await page.locator('#play').isDisabled());assert.ok(await page.locator('#exportVideo').isDisabled());
    const help=page.locator('.dock-direction .help-icon').first();
    await help.hover();assert.ok(await page.locator('#animotionHelp').isVisible());
    assert.match(await page.locator('#animotionHelp').textContent(),/solo afectan el prompt/);
    await page.keyboard.press('Escape');assert.ok(await page.locator('#animotionHelp').isHidden());
    await help.focus();assert.ok(await page.locator('#animotionHelp').isVisible());
    await page.locator('#srtText').focus();assert.ok(await page.locator('#animotionHelp').isHidden());
    async function fillJson(value){if(await page.locator('#jsonText').isHidden())await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(value);}
    async function apply(value){await fillJson(JSON.stringify(value));if(await page.locator('#applyJson').isEnabled())await page.locator('#applyJson').click();}
    assert.ok(await page.locator('#jsonText').isHidden());
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>{throw Error('denied');}}}));
    await page.locator('#pasteJson').click();assert.ok(await page.locator('#jsonText').isVisible());
    await page.locator('#jsonCode summary').click();
    const dropped=await page.evaluateHandle(value=>{
      const data=new DataTransfer();data.items.add(new File([JSON.stringify(value)],'arrastrado.json',{type:'application/json'}));return data;
    },fixture);
    await page.locator('#jsonDrop').dispatchEvent('drop',{dataTransfer:dropped});await dropped.dispose();
    await page.waitForFunction(()=>document.querySelector('#jsonStatus').textContent==='Listo para aplicar');
    assert.ok(await page.locator('#jsonText').isHidden());
    await page.evaluate(value=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>JSON.stringify(value)}}),fixture);
    await page.locator('#pasteJson').click();
    assert.equal(await page.locator('#jsonStatus').textContent(),'Listo para aplicar');
    assert.match(await page.locator('#jsonProjectMeta').textContent(),/0.6 s.*1440 × 2560.*30 FPS/);
    assert.ok(await page.locator('#jsonText').isHidden());await page.locator('#applyJson').click();
    assert.equal(await page.locator('#jsonStatus').textContent(),'Proyecto aplicado');
    assert.match(await page.locator('#jsonInfo').textContent(),/6|1 escenas válidas/);
    assert.equal(await page.locator('#orientation').inputValue(),'portrait');
    assert.equal(await page.locator('#fps').inputValue(),'30');
    assert.equal(await page.locator('#canvas').getAttribute('height'),'2560');
    assert.equal(await page.locator('#textSizeAdjust').inputValue(),'100');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[5].shapes.length),1);
    await page.locator('#play').click();await page.waitForFunction(()=>position>0);
    await page.locator('#play').click();assert.equal(await page.evaluate(()=>playing),false);
    await page.locator('.sceneItem').first().click();
    assert.equal(await page.getByLabel('Entrada',{exact:true}).first().inputValue(),'whip');
    assert.equal(await page.getByLabel('Movimiento',{exact:true}).first().inputValue(),'orbit');
    await page.locator('#textSizeAdjust').fill('200');
    await page.getByLabel('Texto',{exact:true}).fill('Editado después de escalar');
    await page.locator('#iconSizeAdjust').fill('150');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].text),'Editado después de escalar');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].size),180);
    await page.getByLabel('Fin (s)',{exact:true}).fill('3.5');
    assert.equal(await page.locator('#seek').getAttribute('max'),'3500');
    await page.locator('#applyGlobalPalette').check();
    await page.reload();
    assert.ok(await page.locator('#applyGlobalPalette').isChecked());
    assert.equal(await page.locator('#textSizeAdjust').inputValue(),'200');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].size),180);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].text),'Editado después de escalar');
    await fillJson('{');await page.locator('#bgOpacity').fill('55');
    await page.reload();assert.equal(await page.locator('#jsonText').inputValue(),'{');
    assert.equal(await page.evaluate(()=>project.scenes.length),1);
    assert.ok(await page.locator('#applyJson').isDisabled());assert.match(await page.locator('#jsonInfo').textContent(),/⚠/);
    for(const bad of [{...fixture,fps:24},{...fixture,scenes:[null]},{...fixture,resolution:[0,10]}]){
      await apply(bad);assert.match(await page.locator('#jsonInfo').textContent(),/⚠/);
      assert.equal(await page.evaluate(()=>project.scenes[0].end),3.5);
    }
    await page.locator('#srtText').fill('1\n00:00:05,123 --> 00:00:08,234\nHola mundo.');await page.locator('#readSrt').click();
    assert.equal(await page.evaluate(()=>cues[0].start),5.123);
    assert.equal(await page.locator('#srtText').inputValue(),'1\n00:00:05,123 --> 00:00:08,234\nHola mundo.');
    await page.locator('#srtText').fill('Este es un guion corto. Seguimos con la segunda idea.');
    await page.locator('#readSrt').click();
    const preparedText=await page.locator('#srtText').inputValue();
    assert.match(preparedText,/^1\n00:00:00,000 -->/);assert.match(preparedText,/\n\n2\n/);
    await page.locator('#readSrt').click();assert.equal(await page.locator('#srtText').inputValue(),preparedText);
    await page.reload();assert.equal(await page.locator('#srtText').inputValue(),preparedText);
    await page.locator('#srtText').fill('1\n00:00:05,123 --> 00:00:08,234\nHola mundo.');
    await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedPrompt=text;}}});});
    await page.locator('#copyPrompt').click();
    const prompt=await page.evaluate(()=>window.copiedPrompt);
    assert.ok(prompt.includes('Hola mundo.'));assert.ok(prompt.includes('5.123'));assert.ok(prompt.includes('whip'));
    await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('blocked');};document.execCommand=()=>true;});
    const textareas=await page.locator('textarea').count();await page.locator('#copyPrompt').click();assert.equal(await page.locator('textarea').count(),textareas);
    await page.locator('#srtText').fill('1\n00:99:05,123 --> 00:99:08,234\nInválido');await page.locator('#readSrt').click();
    assert.equal(await page.evaluate(()=>cues.length),0);
    await page.locator('#srtText').fill('');await page.locator('#readSrt').click();
    await page.locator('#applyGlobalPalette').uncheck();await apply({...fixture,resolution:[2560,1440]});
    // Importación repetida del mismo archivo y descarga del proyecto validado.
    const imported={name:'proyecto.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...fixture,resolution:[2560,1440]}))};
    for(let i=0;i<2;i++){
      await page.locator('#jsonFile').setInputFiles(imported);
      await page.waitForFunction(()=>document.querySelector('#jsonText').value.includes('Prueba')&&document.querySelector('#jsonFile').value==='');
    }
    await page.locator('#applyJson').click();
    const projectDownloading=page.waitForEvent('download');await page.locator('#downloadJson').click();
    const projectDownload=await projectDownloading;
    assert.equal(JSON.parse(await fs.readFile(await projectDownload.path(),'utf8')).scenes[0].objects[5].shapes.length,1);
    // Cancelar debe desbloquear la interfaz y permitir una nueva exportación.
    await page.locator('#exportVideo').click();await page.waitForFunction(()=>!document.querySelector('#renderOverlay').hidden);
    assert.ok(await page.locator('main').evaluate(node=>node.inert));
    await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('#renderOverlay').hidden);
    assert.equal(await page.locator('main').evaluate(node=>node.inert),false);
    const downloading=page.waitForEvent('download',{timeout:30000});await page.locator('#exportVideo').click();const download=await downloading;
    const videoPath=await download.path();assert.ok((await fs.stat(videoPath)).size>1000);
    // Decodificar el archivo generado confirma que la salida es realmente un video.
    const bytes=await fs.readFile(videoPath);
    const dimensions=await page.evaluate(async({data,mime})=>{
      const video=document.createElement('video'),url=URL.createObjectURL(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:mime}));
      try{return await new Promise((resolve,reject)=>{video.onloadedmetadata=()=>resolve([video.videoWidth,video.videoHeight]);video.onerror=()=>reject(Error('Video ilegible'));video.src=url;});}finally{URL.revokeObjectURL(url);}
    },{data:bytes.toString('base64'),mime:download.suggestedFilename().endsWith('.mp4')?'video/mp4':'video/webm'});
    assert.deepEqual(dimensions,[2560,1440]);
    await page.waitForFunction(()=>document.querySelector('#renderOverlay').hidden);
    // Un fallo del grabador no debe dejar el diálogo abierto ni bloquear controles.
    await page.evaluate(()=>{window.NativeRecorder=MediaRecorder;window.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){throw Error('Fallo simulado');}};});
    await page.locator('#exportVideo').click();
    await page.waitForFunction(()=>document.querySelector('#exportInfo').textContent.includes('Fallo simulado'));
    assert.ok(await page.locator('#renderOverlay').isHidden());assert.ok(await page.locator('#play').isEnabled());
    await page.evaluate(()=>{window.MediaRecorder=window.NativeRecorder;});
    await page.evaluate(()=>{document.querySelector('#jsonCode').open=false;document.querySelectorAll('.anim-dock-body').forEach(node=>node.scrollTop=0);window.scrollTo(0,0);});
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'animotion-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'animotion-mobile.png'),fullPage:true});
    const noStorage=await browser.newPage();
    // Cancelar conserva el contenido; aceptar limpia solo la caja elegida y persiste.
    await page.locator('#srtText').fill('Guion que deseo limpiar.');await page.locator('#readSrt').click();
    const preparedToClear=await page.locator('#srtText').inputValue();
    const originalJson=await page.locator('#jsonText').inputValue();
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#clearSrt').click();
    assert.equal(await page.locator('#srtText').inputValue(),preparedToClear);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#clearSrt').click();
    assert.equal(await page.locator('#srtText').inputValue(),'');assert.equal(await page.evaluate(()=>cues.length),0);
    assert.equal(await page.locator('#jsonText').inputValue(),originalJson);
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#clearJson').click();
    assert.equal(await page.locator('#jsonText').inputValue(),originalJson);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#clearJson').click();
    assert.equal(await page.locator('#jsonText').inputValue(),'');assert.equal(await page.evaluate(()=>project.scenes.length),1);
    await page.reload();assert.equal(await page.locator('#jsonText').inputValue(),'');
    assert.equal(await page.locator('#srtText').inputValue(),'');assert.equal(await page.evaluate(()=>project.scenes.length),1);
    await noStorage.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('blocked');};});
    await noStorage.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await noStorage.goto(origin+'/animotion/animotion');
    await noStorage.locator('#jsonCode summary').click();await noStorage.locator('#jsonText').fill(JSON.stringify(fixture));await noStorage.locator('#applyJson').click();
    assert.ok(await noStorage.locator('#play').isEnabled());await noStorage.close();
    assert.deepEqual(errors,[]);
    console.log(`PASS: inicio vacío, JSON válido/inválido, seis tipos, edición tras escalar, tiempos, persistencia y borradores, SRT, prompt/copia alternativa, cancelación, video decodificable y móvil. Prompt: ${prompt.length} caracteres; video: ${bytes.length} bytes.`);
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
