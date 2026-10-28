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
    const fixture={fps:30,resolution:[2560,1440],scenes:[{start:0,end:2,objects:[{type:'text',text:'Primera',size:100}]},{start:2,end:4,objects:[{type:'text',text:'Segunda',size:80}]}]};
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify(fixture));await page.locator('#applyJson').click();
    await page.locator('#textSizeAdjust').fill('150');await page.locator('.sceneItem').nth(1).click();
    const first=await page.evaluate(()=>JSON.stringify(project.scenes[0]));
    let fragment=JSON.parse(await page.locator('#sceneJsonText').inputValue());
    assert.equal(fragment.start,2);assert.equal(fragment.end,4);assert.equal(fragment.objects[0].size,120);assert.equal(fragment.scenes,undefined);
    const placement=await page.evaluate(()=>({code:document.querySelector('.scene-code-panel').getBoundingClientRect().left,params:document.querySelector('.scene-object-editor').getBoundingClientRect().right}));assert.ok(placement.code>placement.params);
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedScene=text;},readText:async()=>window.pastedScene}}));
    await page.locator('#copySceneJson').click();assert.equal(JSON.parse(await page.evaluate(()=>window.copiedScene)).objects[0].text,'Segunda');
    fragment.end=7;fragment.objects[0].text='Escena modificada con IA';fragment.objects[0].size=240;fragment.objects[0].color='#abcdef';
    await page.evaluate(value=>window.pastedScene='```json\n'+JSON.stringify(value)+'\n```',fragment);
    await page.locator('#pasteSceneJson').click();assert.equal(await page.evaluate(()=>project.scenes[1].end),4);
    await page.locator('#applySceneJson').click();
    assert.equal(await page.evaluate(()=>project.scenes[1].end),7);assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].size),240);
    assert.equal(await page.evaluate(()=>sizeBaseProject.scenes[1].objects[0].size),160);
    assert.equal(await page.evaluate(()=>JSON.stringify(project.scenes[0])),first);assert.equal(await page.evaluate(()=>project.scenes.length),2);
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].text),'Segunda');
    assert.equal(JSON.parse(await page.locator('#sceneJsonText').inputValue()).objects[0].size,120);
    await page.getByRole('button',{name:'Rehacer cambio',exact:true}).click();assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].size),240);
    await page.reload();assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].size),240);
    // Errores y cambios de escena no destruyen borradores ni modifican el proyecto.
    await page.locator('#sceneJsonText').fill('{ inválido');await page.locator('#applySceneJson').click();assert.match(await page.locator('#sceneJsonStatus').textContent(),/⚠/);
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].size),240);
    await page.locator('.sceneItem').first().click();assert.equal(JSON.parse(await page.locator('#sceneJsonText').inputValue()).objects[0].text,'Primera');
    await page.locator('.sceneItem').nth(1).click();assert.equal(await page.locator('#sceneJsonText').inputValue(),'{ inválido');
    await page.reload();assert.equal(await page.locator('#sceneJsonText').inputValue(),'{ inválido');
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#resetSceneJson').click();assert.equal(await page.locator('#sceneJsonText').inputValue(),'{ inválido');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#resetSceneJson').click();assert.equal(JSON.parse(await page.locator('#sceneJsonText').inputValue()).objects[0].size,240);
    const original=await page.locator('#sceneJsonText').inputValue();
    await page.locator('#sceneJsonText').fill(JSON.stringify({scenes:fixture.scenes}));await page.locator('#applySceneJson').click();assert.match(await page.locator('#sceneJsonStatus').textContent(),/una sola escena/);
    await page.locator('#sceneJsonText').fill(original.replace('modificada','en borrador'));
    await page.locator('.scene-layer[data-object-index="0"]').click();await page.locator('#selectedObjectColor').fill('#123456');await page.locator('#selectedObjectColor').dispatchEvent('change');
    assert.ok((await page.locator('#sceneJsonText').inputValue()).includes('en borrador'));assert.match(await page.locator('#sceneJsonStatus').textContent(),/escena cambió/);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#resetSceneJson').click();assert.equal(JSON.parse(await page.locator('#sceneJsonText').inputValue()).objects[0].color,'#123456');
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'animotion-scene-code.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    console.log('PASS: panel derecho, solo escena activa, copiar/pegar con fences, aplicar sin tocar otras escenas, escalas sin duplicación, Ctrl+Z/rehacer, borradores por escena y recarga, errores, restaurar, sincronización visual y móvil.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
