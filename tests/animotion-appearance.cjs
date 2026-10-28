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
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const origin=`http://127.0.0.1:${server.address().port}`;
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin+'/animotion/animotion?step=free');
    const objects=()=>[{type:'text',text:'Texto',x:.5,y:.3,size:100,color:'#ffffff'},
      {type:'icon',name:'star',x:.3,y:.5,size:80,color:'#aa98ff'},
      {type:'vector',x:.7,y:.5,size:200,color:'#aa98ff',shapes:[{kind:'line',points:[{x:-1,y:0},{x:1,y:0}],strokeWidth:.03}]}];
    await page.locator('#jsonCode summary').click();
    await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes:[{start:0,end:2,objects:objects()},{start:2,end:4,objects:objects()}]}));
    await page.locator('#applyJson').click();
    assert.match(await page.locator('#appearanceScope').textContent(),/Todas las escenas/);
    await page.locator('#textSizeAdjust').fill('150');
    assert.deepEqual(await page.evaluate(()=>project.scenes.map(s=>s.objects[0].size)),[150,150]);
    await page.locator('.sceneItem').first().click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].individualStyle),false);
    await page.locator('#textSizeAdjust').fill('200');
    await page.locator('#fg').fill('#ff0000');await page.locator('#fontFamily').selectOption('Inter');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].size),200);
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].size),150);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].fontFamily),'Inter');
    await page.locator('#deselectObject').click();
    assert.equal(await page.locator('#textSizeAdjust').inputValue(),'150');
    assert.equal(await page.locator('#fontFamily').inputValue(),'Outfit');
    await page.locator('#textSizeAdjust').fill('300');await page.locator('#fg').fill('#00ff00');await page.locator('#fontFamily').selectOption('Oswald');
    assert.deepEqual(await page.evaluate(()=>project.scenes.map(s=>s.objects[0].size)),[200,300]);
    assert.deepEqual(await page.evaluate(()=>project.scenes.map(s=>s.objects[0].color)),['#ff0000','#00ff00']);
    await page.locator('.scene-layer[data-object-index="2"]').click();await page.locator('#strokeAdjust').fill('70');
    await page.locator('#selectedObjectColor').fill('#123456');
    assert.equal(await page.getByLabel('Color',{exact:true}).inputValue(),'#123456');
    assert.equal(await page.locator('#vectorColor').inputValue(),'#123456');
    await page.getByLabel('Color',{exact:true}).fill('#abcdef');
    assert.equal(await page.locator('#selectedObjectColor').inputValue(),'#abcdef');
    assert.equal(await page.locator('#selectedObjectColorValue').textContent(),'#ABCDEF');
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();
    assert.equal(await page.locator('#selectedObjectColor').inputValue(),'#123456');
    assert.equal(await page.evaluate(()=>strokeScale(project.scenes[0].objects[2])),.7);
    await page.locator('#deselectObject').click();await page.locator('#strokeAdjust').fill('200');await page.locator('#iconSizeAdjust').fill('150');
    assert.deepEqual(await page.evaluate(()=>project.scenes.map(s=>s.objects[2].size)),[200,300]);
    assert.deepEqual(await page.evaluate(()=>project.scenes.map(s=>strokeScale(s.objects[2]))),[.7,2]);
    // Una edición manual del formulario también protege el objeto.
    await page.locator('.scene-layer[data-object-index="1"]').click();await page.getByLabel('X (0–1)',{exact:true}).fill('.4');
    await page.locator('#deselectObject').click();await page.locator('#accent').fill('#0000ff');await page.locator('#iconSizeAdjust').fill('200');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].color),'#aa98ff');
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[1].color),'#0000ff');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].size),120);
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[1].size),160);
    // Volver a heredar actualiza el objeto y mantiene su texto, posición y tiempos.
    await page.locator('.scene-layer[data-object-index="0"]').click();await page.locator('#inheritAppearance').click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].individualStyle),false);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].size),300);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].color),'#00ff00');
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].individualStyle),true);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].size),200);
    // Seleccionar y deseleccionar no gasta historial ni marca el objeto.
    const history=await page.evaluate(()=>editHistory.length);
    await page.locator('#deselectObject').click();await page.locator('.sceneItem').nth(1).click();await page.locator('#deselectObject').click();
    assert.equal(await page.evaluate(()=>editHistory.length),history);
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].individualStyle),false);
    await page.reload();
    assert.equal(await page.evaluate(()=>appearanceGlobals.textSizeAdjust),'300');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].size),200);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].fontFamily),'Inter');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[2].strokeMultiplier),.7);
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].size),300);
    // El JSON exportado conserva las excepciones individuales.
    const downloading=page.waitForEvent('download');await page.locator('#downloadJson').click();
    const data=JSON.parse(await fs.readFile(await (await downloading).path(),'utf8'));
    assert.equal(data.scenes[0].objects[0].individualStyle,true);assert.equal(data.scenes[0].objects[0].fontFamily,'Inter');
    await page.locator('.sceneItem').first().click();await page.locator('#inheritAppearance').click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].size),300);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].fontFamily),null);
    assert.deepEqual(errors,[]);
    console.log('PASS: alcance global multiescena, selección sin cambios, tamaño/color/fuente/grosor locales, protección por edición manual, deselección, herencia, Ctrl+Z, recarga y JSON.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
