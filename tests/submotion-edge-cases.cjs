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
 browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());await page.goto(origin+'/submotion/submotion');await page.locator('#srt').fill('Hola mundo\nOtra frase');await page.locator('#load').click();assert.equal(await page.locator('.studio-nav [aria-selected=true]').count(),1);
 // Arrastrar un píxel no debe proteger el estilo de un texto sin modificarlo.
 await page.locator('.cue').first().click();await page.locator('#canvas').scrollIntoViewIfNeeded();let rect=await page.locator('#canvas').boundingBox(),bounds=await page.evaluate(()=>window.submotionBounds);let x=rect.x+(bounds.x+bounds.width/2)/2560*rect.width,y=rect.y+(bounds.y+bounds.height/2)/1440*rect.height;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+.1,y+.1);await page.mouse.up();assert.equal(await page.evaluate(()=>submotionCore.cues[0].style),undefined);
 // Cancelar arrastre restaura el modelo y no añade historial.
 const before=await page.evaluate(()=>({cues:JSON.stringify(submotionCore.cues),history:submotionStudio.historyLength}));await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+50,y+20);assert.ok(await page.evaluate(()=>submotionCore.cues[0].style));await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>JSON.stringify(submotionCore.cues)),before.cues);assert.equal(await page.evaluate(()=>submotionStudio.historyLength),before.history);
 // Redimensionar desde el tirador y recuperar con Undo.
 rect=await page.locator('#canvas').boundingBox();bounds=await page.evaluate(()=>window.submotionBounds);x=rect.x+(bounds.x+bounds.width)/2560*rect.width;y=rect.y+(bounds.y+bounds.height)/1440*rect.height;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y+15,{steps:3});await page.mouse.up();assert.ok(await page.evaluate(()=>Number(submotionCore.cues[0].style.size))>100);await page.locator('#studioUndo').click();assert.equal(await page.evaluate(()=>submotionCore.cues[0].style),undefined);
 // 20 pasos de Undo/Redo y una rama nueva.
 await page.locator('#canvas').focus();for(let i=0;i<25;i++)await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>submotionStudio.historyLength),20);for(let i=0;i<20;i++)await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>submotionStudio.redoLength),20);for(let i=0;i<20;i++)await page.keyboard.press('Control+Shift+z');await page.keyboard.press('Control+z');await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>submotionStudio.redoLength),0);
 // Los borradores del SRT no se sobrescriben al mover el texto.
 await page.locator('[data-mode=import]').click();await page.locator('#srt').fill('Borrador sin aplicar');await page.locator('[data-mode=edit]').click();await page.locator('#canvas').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#srt').inputValue(),'Borrador sin aplicar');
 // Validar antes de confirmar, y cancelar apertura sin perder el proyecto.
 const original=await page.evaluate(()=>JSON.stringify(submotionCore.cues));let dialogs=0;const onDialog=async d=>{dialogs++;await d.dismiss();};page.on('dialog',onDialog);
 await page.locator('#studioFile').setInputFiles({name:'malo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'datools-submotion-project',version:1,cues:[{text:'mal',start:3,end:1}],settings:{},script:''}))});await page.waitForFunction(()=>document.querySelector('#studioFile').value==='');assert.equal(dialogs,0);assert.equal(await page.evaluate(()=>JSON.stringify(submotionCore.cues)),original);
 const saved=page.waitForEvent('download');await page.locator('#studioSave').click();const file=await saved;await page.locator('#studioFile').setInputFiles({name:'bien.json',mimeType:'application/json',buffer:await fs.readFile(await file.path())});await page.waitForFunction(()=>document.querySelector('#studioFile').value==='');assert.equal(dialogs,1);assert.equal(await page.evaluate(()=>JSON.stringify(submotionCore.cues)),original);page.off('dialog',onDialog);
 // Reproducción y fader mantienen el inspector conectado al fragmento activo.
 await page.locator('#studioDeselect').click();await page.locator('#play').click();await page.waitForFunction(()=>submotionCore.current>.2);assert.ok(await page.evaluate(()=>submotionStudio.selection.length===1));assert.ok((await page.locator('#studioScope').textContent()).includes('seleccionado'));await page.locator('#play').click();
 // Fallo de grabador recupera todos los controles.
 await page.locator('[data-mode=export]').click();await page.evaluate(()=>{window.NativeRecorder=MediaRecorder;window.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){throw Error('Codificador de prueba');}};});await page.locator('#export').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Codificador de prueba'));assert.equal(await page.evaluate(()=>submotionCore.recording),false);assert.ok(await page.locator('#export').isEnabled());assert.ok(await page.locator('#cancelExport').isHidden());await page.evaluate(()=>window.MediaRecorder=window.NativeRecorder);
 // Presión sobre los colores: 80 entradas, 1000 fragmentos, un render y guardado.
 await page.locator('[data-mode=edit]').click();await page.evaluate(()=>{submotionCore.replace(Array.from({length:1000},(_,i)=>({id:'cue-'+i,start:i,end:i+1,text:'Prueba '+i})));submotionStudio.changed();});
 if(await page.locator('#studioDeselect').isVisible())await page.locator('#studioDeselect').click();const perf=await page.evaluate(async()=>{const api=submotionCore,oldDraw=api.draw,oldSave=api.save,counts={draw:0,save:0};api.draw=(...args)=>{counts.draw++;return oldDraw(...args);};api.save=(...args)=>{counts.save++;return oldSave(...args);};const input=document.querySelector('#textColor'),start=performance.now();for(let i=0;i<80;i++){input.value='#'+(0x330000+i).toString(16);input.dispatchEvent(new Event('input',{bubbles:true}));}const inputMs=performance.now()-start,during={...counts};await new Promise(r=>requestAnimationFrame(r));input.dispatchEvent(new Event('change',{bubbles:true}));api.draw=oldDraw;api.save=oldSave;return {during,counts,inputMs};});assert.deepEqual(perf.during,{draw:0,save:0});assert.deepEqual(perf.counts,{draw:1,save:1});
 const restricted=await browser.newPage();await restricted.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('Sin almacenamiento');};});const restrictedErrors=[];restricted.on('pageerror',e=>restrictedErrors.push(e.message));await restricted.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());await restricted.goto(origin+'/submotion/submotion');await restricted.locator('#srt').fill('Texto sin almacenamiento');await restricted.locator('#load').click();assert.ok(await restricted.locator('#canvas').isVisible());assert.deepEqual(restrictedErrors,[]);assert.deepEqual(errors,[]);
 console.log('PASS: arrastre/resize/Cancelar, 20 pasos Undo/Redo, borrador SRT, validar/cancelar proyecto, inspector al reproducir, error de grabador, almacenamiento bloqueado y 1000 fragmentos: 80 colores → un render y un guardado ('+perf.inputMs.toFixed(1)+' ms de entrada).');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});