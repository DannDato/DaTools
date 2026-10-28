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
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin+'/animotion/animotion?step=create');
 await page.locator('#jsonCode summary').click();
 await page.locator('#jsonText').fill(JSON.stringify({scenes:[[0,2],[2,4],[5,6]].map(([start,end])=>({start,end,objects:[{type:'rect',x:.5,y:.5,width:.2,height:.2}]}))}));
 await page.locator('#applyJson').click();
 const scrub=async value=>page.locator('#seek').evaluate((node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));},value);
 const model=await page.evaluate(()=>JSON.stringify(project)),history=await page.evaluate(()=>editHistory.length);
 await scrub(2500);assert.equal(await page.evaluate(()=>selectedSceneIndex),1);assert.equal(await page.locator('.sceneItem.selected').count(),1);assert.equal(await page.evaluate(()=>position),2.5);
 await page.locator('.sceneItem').last().click();assert.equal(await page.evaluate(()=>position),5);assert.equal(await page.locator('#seek').inputValue(),'5000');assert.ok(await page.evaluate(()=>canvasEditor.editing));
 await page.evaluate(()=>window.inspectorBefore=document.querySelector('.scene-object-editor'));
 await scrub(5500);assert.equal(await page.evaluate(()=>selectedObjectIndex),0);assert.ok(await page.evaluate(()=>window.inspectorBefore===document.querySelector('.scene-object-editor')));
 await scrub(2000);assert.equal(await page.evaluate(()=>selectedSceneIndex),1);assert.equal(await page.evaluate(()=>selectedObjectIndex),-1);
 await scrub(4500);assert.equal(await page.evaluate(()=>selectedSceneIndex),-1);assert.equal(await page.locator('.sceneItem.selected').count(),0);
 await page.locator('#seek').focus();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>selectedSceneIndex),2);assert.equal(await page.evaluate(()=>position),6);
 await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>selectedSceneIndex),0);
 await page.locator('#step-export').click();await scrub(3000);assert.equal(await page.evaluate(()=>workflow.stage),'export');assert.equal(await page.evaluate(()=>selectedSceneIndex),1);
 assert.equal(await page.evaluate(()=>JSON.stringify(project)),model);assert.equal(await page.evaluate(()=>editHistory.length),history);
 await page.reload();assert.equal(await page.evaluate(()=>selectedSceneIndex),1);
 assert.deepEqual(errors,[]);console.log('PASS: fader selecciona escena, límites y huecos, clic mueve al inicio exacto, selección local estable, teclado, Exportar sin cambio de etapa, recarga y sin modificar modelo/historial.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});