const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try{
    let filename=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
    if(!filename.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(!path.extname(filename))filename+='.html';
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[path.extname(filename)]||'application/octet-stream');
    res.end(await fs.readFile(filename));
  }catch{res.writeHead(404);res.end();}
});
(async()=>{
 let browser;await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  const origin='http://127.0.0.1:'+server.address().port;await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  await page.goto(origin+'/submotion/submotion');assert.deepEqual(errors,[]);assert.ok(await page.locator('#srt').isVisible());assert.ok(await page.locator('[data-mode=edit]').isDisabled());
  await page.locator('#srt').fill('1\n00:00:00,000 --> 00:00:01,000\nHola mundo\n\n2\n00:00:01,000 --> 00:00:02,000\nSegunda frase\n\n3\n00:00:03,000 --> 00:00:04,000\nOtra idea');await page.locator('#load').click();assert.ok(await page.locator('#canvas').isVisible());assert.equal(await page.evaluate(()=>submotionCore.cues.length),3);
  // Apariencia individual, global y herencia.
  await page.locator('.cue').first().click();await page.locator('#textColor').fill('#ff0000');await page.locator('#textColor').dispatchEvent('change');assert.equal(await page.evaluate(()=>submotionCore.cues[0].style.textColor),'#ff0000');
  await page.locator('#posX').fill('30');await page.locator('#posX').dispatchEvent('change');
  await page.locator('#studioDeselect').click();await page.locator('#textColor').fill('#00ff00');await page.locator('#textColor').dispatchEvent('change');assert.equal(await page.evaluate(()=>submotionCore.styleValue('textColor',submotionCore.cues[0])),'#ff0000');assert.equal(await page.evaluate(()=>submotionCore.styleValue('textColor',submotionCore.cues[1])),'#00ff00');
  await page.locator('.cue').first().click();await page.locator('.cue').nth(1).click({modifiers:['Shift']});assert.equal(await page.evaluate(()=>submotionStudio.selection.length),2);await page.locator('#size').fill('120');await page.locator('#size').dispatchEvent('change');assert.ok(await page.evaluate(()=>submotionCore.cues.slice(0,2).every(c=>c.style.size==='120')));
  // Arrastre real de la selección, conservando distancias y un paso de historial.
  const before=await page.evaluate(()=>({xs:submotionCore.cues.slice(0,2).map(c=>Number(c.style.posX)),history:submotionStudio.historyLength}));
  let box=await page.locator('#canvas').boundingBox();let bounds=await page.evaluate(()=>window.submotionBounds);const x=box.x+(bounds.x+bounds.width/2)/2560*box.width,y=box.y+(bounds.y+bounds.height/2)/1440*box.height;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+20,{steps:5});await page.mouse.up();
  const moved=await page.evaluate(()=>({xs:submotionCore.cues.slice(0,2).map(c=>Number(c.style.posX)),history:submotionStudio.historyLength}));assert.ok(moved.xs[1]>before.xs[1]);assert.ok(Math.abs(moved.xs[1]-moved.xs[0]-(before.xs[1]-before.xs[0]))<.001);assert.equal(moved.history,before.history+1);
  await page.locator('#studioUndo').click();assert.ok(Math.abs(await page.evaluate(()=>Number(submotionCore.cues[1].style.posX))-before.xs[1])<.001);await page.locator('#studioRedo').click();
  // Fader selecciona el fragmento; clic vuelve a su inicio exacto.
  await page.locator('#seek').evaluate(node=>{node.value=700;node.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.evaluate(()=>submotionStudio.selection[0]),await page.evaluate(()=>submotionCore.cues[2].id));await page.locator('.cue').first().click();assert.equal(await page.evaluate(()=>submotionCore.current),0);
  // Editar texto conserva estilo individual e identidad.
  await page.locator('[data-inspector=detail]').click();await page.locator('#editText').fill('Texto corregido');await page.locator('#saveCueEdit').click();assert.equal(await page.evaluate(()=>submotionCore.cues[0].text),'Texto corregido');assert.equal(await page.evaluate(()=>submotionCore.cues[0].style.textColor),'#ff0000');
  // Línea de tiempo con extremos y teclado.
  await page.locator('#studioTimelineToggle').click();const bar=page.locator('.studio-timebar').first();let end=await bar.locator('[data-edge=end]').boundingBox();await page.mouse.move(end.x+end.width/2,end.y+end.height/2);await page.mouse.down();await page.mouse.move(end.x+end.width/2+24,end.y+end.height/2,{steps:4});await page.mouse.up();assert.ok(await page.evaluate(()=>submotionCore.cues[0].end)>1.2);
  await page.locator('.studio-timebar').first().focus();await page.keyboard.press('ArrowRight');assert.ok(await page.evaluate(()=>submotionCore.cues[0].start)>=.09);
  // Preset propio y aplicación al alcance seleccionado.
  await page.locator('[data-inspector=appearance]').click();await page.locator('#studioPresetName').fill('Mi estilo');await page.locator('#studioSavePreset').click();assert.equal(await page.locator('#studioPreset option[value="Mi estilo"]').count(),1);await page.locator('#studioPreset').selectOption('Suave');await page.locator('#studioApplyPreset').click();assert.equal(await page.evaluate(()=>submotionCore.cues[0].style.animation),'rise');
  // Guardar y reabrir conserva tiempos, estilos y texto.
  const saving=page.waitForEvent('download');await page.locator('#studioSave').click();const saved=await saving,bytes=await fs.readFile(await saved.path()),document=JSON.parse(bytes);assert.equal(document.format,'datools-submotion-project');assert.equal(document.cues[0].text,'Texto corregido');
  const currentModel=await page.evaluate(()=>JSON.stringify(submotionCore.cues));await page.reload();assert.deepEqual(await page.evaluate(()=>submotionCore.cues),JSON.parse(currentModel));assert.equal(await page.locator('#studioPreset option[value="Mi estilo"]').count(),1);
  page.once('dialog',d=>d.accept());await page.locator('#studioFile').setInputFiles({name:'proyecto.json',mimeType:'application/json',buffer:bytes});await page.waitForFunction(()=>document.querySelector('#studioFile').value==='');assert.deepEqual(await page.evaluate(()=>submotionCore.cues),JSON.parse(currentModel));assert.equal(await page.evaluate(()=>submotionStudio.historyLength),0);
  // Se puede seguir descargando un SRT interoperable.
  await page.locator('[data-mode=export]').click();const srtDownload=page.waitForEvent('download');await page.locator('#downloadSrt').click();const srt=await srtDownload;assert.ok((await fs.readFile(await srt.path(),'utf8')).includes('Texto corregido'));
  // Cancelación inline y video real, sin modal.
  await page.locator('#tail').selectOption('0');await page.locator('#tail').dispatchEvent('input');await page.locator('#export').click();await page.waitForFunction(()=>submotionCore.recording&&submotionCore.current>.05);assert.ok(await page.locator('#canvas').isVisible());await page.locator('#cancelExport').click();await page.waitForFunction(()=>!submotionCore.recording);assert.ok((await page.locator('#status').textContent()).includes('cancelada'));
  const downloading=page.waitForEvent('download',{timeout:60000});await page.locator('#export').click();const video=await downloading;assert.ok((await fs.stat(await video.path())).size>1000);await page.waitForFunction(()=>!submotionCore.recording);
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/submotion-studio-export.png',fullPage:true});
  // Responsive en las tres etapas y retorno a la vista libre.
  for(const [width,height] of [[320,740],[390,844],[768,1024],[1024,600],[1440,900]]){await page.setViewportSize({width,height});for(const mode of ['import','edit','export']){await page.locator('[data-mode='+mode+']').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow '+width+' '+mode);}}
  await page.locator('[data-mode=edit]').click();if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/submotion-studio.png',fullPage:true});await page.locator('.studio-nav summary').click();await page.locator('[data-mode=free]').click();assert.ok(await page.locator('#dockGrid').isVisible());assert.deepEqual(errors,[]);
  console.log('PASS: importar/editar/exportar, estilos locales/globales, Shift, arrastre de grupo, historial, fader, editar texto, tiempos con mouse/teclado, presets, proyecto/recarga, SRT, cancelar y video real, responsive y Vista libre.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});