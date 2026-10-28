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
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const origin='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const submotion=await fs.readFile(path.join(root,'submotion/submotion.html'),'utf8'),expected=[...submotion.match(/<select id="font">([\s\S]*?)<\/select>/)[1].matchAll(/value="([^"]+)"/g)].map(m=>m[1]);
 await page.goto(origin+'/animotion/animotion?step=create');assert.deepEqual(await page.locator('#fontFamily option').evaluateAll(nodes=>nodes.map(n=>n.value)),expected);assert.equal(await page.locator('#fontFamily').inputValue(),'Outfit');
 assert.ok(await page.evaluate(()=>document.querySelector('link[href*="fonts.googleapis.com/css2"]').href.includes('Caveat')));
 await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({scenes:[{start:0,end:.5,objects:[{type:'text',text:'Fuentes',fontFamily:'Caveat',individualStyle:true,weight:400},{type:'text',text:'Global',weight:700}]}]}));await page.locator('#applyJson').click();
 assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].fontFamily),'Caveat');
 await page.locator('#fontFamily').selectOption('Bebas Neue');await page.waitForFunction(()=>!appearanceEditor.pending);
 assert.equal(await page.evaluate(()=>globalAppearance('fontFamily')),'Bebas Neue');
 await page.locator('.sceneItem').first().click();await page.locator('[data-inspector=appearance]').click();await page.locator('#fontFamily').selectOption('Permanent Marker');await page.waitForFunction(()=>!appearanceEditor.pending);
 assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].fontFamily),'Permanent Marker');
 const requests=await page.evaluate(async()=>{const original=document.fonts.load,seen=[];document.fonts.load=async spec=>{seen.push(spec);return [];};try{await loadCanvasFonts();return seen;}finally{document.fonts.load=original;}});
 assert.ok(requests.includes('400 32px "Permanent Marker"'));assert.ok(requests.includes('700 32px "Bebas Neue"'));
 const saving=page.waitForEvent('download');await page.locator('#saveProject').click();const file=await saving,bytes=await fs.readFile(await file.path());page.once('dialog',d=>d.accept());await page.locator('#projectFileInput').setInputFiles({name:'fuentes.json',mimeType:'application/json',buffer:bytes});await page.waitForFunction(()=>document.querySelector('#projectFileInput').value==='');assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].fontFamily),'Permanent Marker');
 await page.reload();assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].fontFamily),'Permanent Marker');assert.equal(await page.evaluate(()=>globalAppearance('fontFamily')),'Bebas Neue');
 assert.deepEqual(errors,[]);console.log('PASS: '+expected.length+' fuentes iguales a Submotion, Outfit predeterminado, enlaces Google, fuente global/individual, JSON, carga por peso, proyecto y recarga. Las descargas externas están bloqueadas en esta prueba.');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});