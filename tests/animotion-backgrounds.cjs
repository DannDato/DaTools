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
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin+'/animotion/animotion?step=create');await page.locator('#workflowBlank').click();
 const results=await page.evaluate(()=>{
   const result=[];const hash=()=>{const bytes=ctx.getImageData(0,0,canvas.width,canvas.height).data;let value=2166136261;for(let i=0;i<bytes.length;i+=7)value=Math.imul(value^bytes[i],16777619);return value>>>0;};
   const thumbnails=document.createElement('div');thumbnails.id='backgroundGallery';thumbnails.style.cssText='position:relative;z-index:100;background:#101014;padding:20px;display:grid;grid-template-columns:repeat(3,320px);gap:12px;width:max-content;color:white;';
   for(const [w,h] of [[640,360],[360,640]]){
     canvas.width=w;canvas.height=h;$('bgOpacity').value='75';
     for(const preset of [...$('backgroundPreset').options].map(o=>o.value)){
       $('backgroundPreset').value=preset;
       for(const mode of ['flow','pulse','still']){
         $('backgroundMotion').value=mode;$('backgroundSpeed').value='100';
         render(0);const first=hash();render(3.7);const second=hash();render(0);const repeat=hash();
         result.push({preset,mode,w,first,second,repeat});
         if(w===640&&mode==='flow'){
           render(2);const tile=document.createElement('div'),label=document.createElement('p'),thumb=document.createElement('canvas');thumb.width=320;thumb.height=180;thumb.getContext('2d').drawImage(canvas,0,0,320,180);label.textContent=$('backgroundPreset').selectedOptions[0].textContent;tile.append(thumb,label);thumbnails.append(tile);
         }
       }
     }
   }
   $('backgroundPreset').value='aurora';$('backgroundMotion').value='flow';$('backgroundSpeed').value='100';render(0);const normal=hash();$('backgroundSpeed').value='200';render(1);const fast=hash();$('backgroundSpeed').value='100';render(2);const equivalent=hash();
   $('bgOpacity').value='0';render(2);const invisible=hash();$('backgroundPreset').value='solid';render(2);const base=hash();
   document.querySelector('main').after(thumbnails);resize();
   return {result,normal,fast,equivalent,invisible,base};
 });
 for(const r of results.result){assert.equal(r.first,r.repeat,'Determinista '+r.preset);if(r.mode==='still'||r.preset==='solid')assert.equal(r.first,r.second,'Estático '+r.preset);else assert.notEqual(r.first,r.second,'Animación '+r.preset+' '+r.mode+' '+r.w);}
 assert.equal(results.fast,results.equivalent,'La velocidad respeta el tiempo absoluto');assert.equal(results.invisible,results.base,'Opacidad cero conserva el fondo base');
 if(process.env.SCREENSHOT_DIR)await page.locator('#backgroundGallery').screenshot({path:process.env.SCREENSHOT_DIR+'/animotion-backgrounds.png'});
 await page.locator('#backgroundGallery').evaluate(n=>n.remove());
 await page.locator('#backgroundPreset').selectOption('waves');assert.equal(await page.locator('#backgroundMotion option[value=flow]').textContent(),'Ondas viajeras');
 await page.locator('#backgroundMotion').selectOption('still');assert.ok(await page.locator('#backgroundSpeed').isHidden());
 await page.locator('#backgroundMotion').selectOption('pulse');await page.locator('#backgroundSpeed').fill('150');
 await page.locator('#backgroundSpeed').dispatchEvent('change');await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();
 assert.equal(await page.locator('#backgroundSpeed').inputValue(),'100');await page.getByRole('button',{name:'Rehacer cambio',exact:true}).click();assert.equal(await page.locator('#backgroundSpeed').inputValue(),'150');
 await page.reload();assert.equal(await page.locator('#backgroundPreset').inputValue(),'waves');assert.equal(await page.locator('#backgroundMotion').inputValue(),'pulse');assert.equal(await page.locator('#backgroundSpeed').inputValue(),'150');
 const saving=page.waitForEvent('download');await page.locator('#saveProject').click();const saved=await saving,bytes=await fs.readFile(await saved.path());const file=JSON.parse(bytes);assert.equal(file.editor.controls.backgroundMotion,'pulse');assert.equal(file.editor.controls.backgroundSpeed,'150');
 await page.locator('#backgroundPreset').selectOption('solid');page.once('dialog',d=>d.accept());await page.locator('#projectFileInput').setInputFiles({name:'fondos.json',mimeType:'application/json',buffer:bytes});await page.waitForFunction(()=>document.querySelector('#projectFileInput').value==='');assert.equal(await page.locator('#backgroundPreset').inputValue(),'waves');assert.equal(await page.locator('#backgroundSpeed').inputValue(),'150');
 await page.locator('#step-export').click();const downloading=page.waitForEvent('download',{timeout:60000});await page.locator('#workflowExport').click();const video=await downloading;assert.ok((await fs.stat(await video.path())).size>1000);
 assert.deepEqual(errors,[]);console.log('PASS: 10 fondos, dos animaciones por tipo y modo estático, horizontal/vertical, determinismo, velocidad, opacidad, historial, recarga, guardar/abrir y video real con fondo animado.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});