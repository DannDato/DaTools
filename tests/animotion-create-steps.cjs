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
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());await page.goto(origin+'/animotion/animotion?step=create');
 for(const selector of ['#srtText','#copyPrompt','#pasteJson'])assert.ok(await page.locator(selector).isVisible());assert.equal(await page.locator('.create-steps').count(),0);
 const boxes=await page.locator('.workflow-create > .workflow-stack').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top};}));assert.ok(boxes[0].right<boxes[1].left&&boxes[1].right<boxes[2].left);assert.ok(boxes.every(b=>Math.abs(b.top-boxes[0].top)<1));
 await page.locator('#srtText').fill('Un guion personal para explicar una idea con dibujos.');await page.locator('#workflowPreset').selectOption('sketch');
 await page.evaluate(()=>{document.execCommand=()=>true;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedPrompt=text;}}});});await page.locator('#copyPrompt').click();assert.ok((await page.evaluate(()=>window.copiedPrompt)).includes('Boceto'));assert.ok(await page.locator('#srtText').isVisible());
 await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill('{borrador');await page.reload();assert.equal(await page.locator('#workflowPreset').inputValue(),'sketch');assert.equal(await page.locator('#jsonText').inputValue(),'{borrador');assert.ok(await page.locator('#srtText').isVisible());
 for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:900});for(const selector of ['#srtText','#copyPrompt','#pasteJson'])assert.ok(await page.locator(selector).isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/animotion-create-columns.png',fullPage:true});
 if(!await page.locator('#jsonCode').evaluate(n=>n.open))await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({scenes:[{start:0,end:1,objects:[]}]}));await page.locator('#applyJson').click();assert.equal(await page.evaluate(()=>workflow.stage),'edit');
 await page.locator('#step-create').click();for(const selector of ['#srtText','#copyPrompt','#pasteJson'])assert.ok(await page.locator(selector).isVisible());assert.deepEqual(errors,[]);
 console.log('PASS: tres columnas alineadas, sin subtabs, todo visible, guion/prompt/JSON, recarga, borradores, móvil/tablet/escritorio y aplicar escenas.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});