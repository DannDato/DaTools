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
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin+'/animotion/animotion?step=create');await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({fps:30,scenes:[{start:0,end:1.5,objects:[{type:'rect',x:.5,y:.5,width:.3,height:.3,enter:'slide-left'}]}]}));await page.locator('#applyJson').click();
 await page.locator('#step-export').click();await page.locator('#workflowExport').click();await page.waitForFunction(()=>exporting&&Number(document.querySelector('#workflowExportProgress [role=progressbar]').getAttribute('aria-valuenow'))>5);
 assert.ok(await page.locator('#renderOverlay').isHidden());assert.ok(await page.locator('#canvas').isVisible());assert.ok(await page.locator('#workflowExportProgress').isVisible());assert.ok(await page.locator('#workflowExportCancel').isVisible());assert.ok(await page.locator('#workflowExport').isDisabled());
 assert.equal(await page.locator('main').evaluate(n=>n.inert),false);assert.equal(await page.locator('.dock-appearance').evaluate(n=>n.inert),true);assert.equal(await page.locator('.transport').evaluate(n=>n.inert),true);
 assert.ok(await page.evaluate(()=>Number(document.querySelector('#seek').value)>0));
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/animotion-export-inline.png',fullPage:true});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!exporting);assert.ok(await page.locator('#workflowExportStatus').textContent().then(t=>t.includes('cancelada')));assert.ok(await page.locator('#workflowExportCancel').isHidden());assert.ok(await page.locator('#workflowExport').isEnabled());assert.equal(await page.locator('header').evaluate(n=>n.inert),false);
 const downloading=page.waitForEvent('download',{timeout:60000});await page.locator('#workflowExport').click();const video=await downloading;assert.ok((await fs.stat(await video.path())).size>1000);await page.waitForFunction(()=>!exporting);
 assert.equal(await page.locator('#workflowExportPercent').textContent(),'100%');assert.ok((await page.locator('#workflowExportStatus').textContent()).includes('Video generado'));
 await page.evaluate(()=>{window.NativeRecorder=MediaRecorder;window.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){throw Error('Error de prueba');}};});
 await page.locator('#workflowExport').click();await page.waitForFunction(()=>document.querySelector('#workflowExportStatus').textContent.includes('Error de prueba'));assert.equal(await page.evaluate(()=>exporting),false);assert.ok(await page.locator('#workflowExport').isEnabled());assert.equal(await page.locator('.transport').evaluate(n=>n.inert),false);await page.evaluate(()=>window.MediaRecorder=window.NativeRecorder);
 assert.deepEqual(errors,[]);console.log('PASS: progreso inline, preview visible y avanzando, sin modal, controles protegidos, cancelar/Esc, descarga real, progreso al 100% y recuperación tras fallo.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});