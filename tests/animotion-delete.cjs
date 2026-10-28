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
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes:[{start:0,end:2,objects:[{type:'text',text:'Eliminar primero'},{type:'circle',size:100},{type:'rect',width:.2,height:.2}]},{start:2,end:4,objects:[{type:'text',text:'Conservar otra escena'}]}]}));await page.locator('#applyJson').click();
    await page.locator('.sceneItem').first().click();
    assert.equal(await page.locator('#deleteSelectedObjects').textContent(),'Eliminar objeto…');
    const otherScene=await page.evaluate(()=>JSON.stringify(project.scenes[1])),beforeCancel=await page.evaluate(()=>editHistory.length);
    page.once('dialog',async dialog=>{assert.equal(dialog.type(),'confirm');assert.match(dialog.message(),/objeto 1.*escena 1/);await dialog.dismiss();});
    await page.locator('#deleteSelectedObjects').click();assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),3);assert.equal(await page.evaluate(()=>editHistory.length),beforeCancel);
    await page.locator('.scene-layer[data-object-index="0"]').click();await page.locator('#canvas').focus();
    await page.keyboard.press('Backspace');assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].hidden),true);assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),3);
    await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),3);
    await page.keyboard.press('Backspace');assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].hidden),false);
    const beforeDelete=await page.evaluate(()=>editHistory.length);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#deleteSelectedObjects').click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),2);assert.equal(await page.evaluate(()=>sizeBaseProject.scenes[0].objects.length),2);
    assert.equal(await page.evaluate(()=>JSON.stringify(project.scenes[1])),otherScene);assert.equal(await page.evaluate(()=>editHistory.length),beforeDelete+1);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].type),'circle');assert.deepEqual(await page.evaluate(()=>selectionIndices()),[]);
    assert.equal(JSON.parse(await page.locator('#sceneJsonText').inputValue()).objects.length,2);assert.equal(await page.locator('#deleteSelectedObjects').count(),0);
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].text),'Eliminar primero');
    await page.getByRole('button',{name:'Rehacer cambio',exact:true}).click();assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),2);
    await page.locator('.scene-layer[data-object-index="0"]').click();await page.locator('.scene-layer[data-object-index="1"]').click({modifiers:['Shift']});
    assert.equal(await page.locator('#deleteSelectedObjects').textContent(),'Eliminar 2 objetos…');
    page.once('dialog',async dialog=>{assert.match(dialog.message(),/2 objetos seleccionados/);await dialog.dismiss();});await page.locator('#deleteSelectedObjects').click();assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),2);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#deleteSelectedObjects').click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),0);assert.equal(await page.evaluate(()=>sizeBaseProject.scenes[0].objects.length),0);assert.equal(await page.evaluate(()=>project.scenes.length),2);
    assert.equal(JSON.parse(await page.locator('#sceneJsonText').inputValue()).objects.length,0);
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),2);assert.deepEqual(await page.evaluate(()=>selectionIndices().sort()),[0,1]);
    await page.getByRole('button',{name:'Rehacer cambio',exact:true}).click();await page.reload();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),0);assert.equal(await page.evaluate(()=>JSON.stringify(project.scenes[1])),otherScene);
    assert.deepEqual(errors,[]);
    console.log('PASS: botón solo en detalle, confirmar/cancelar, Backspace solo oculta, Delete sin eliminación, JSON/modelo/base sincronizados, una o varias capas, escena vacía conservada, otras escenas intactas, Ctrl+Z/Rehacer y recarga.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
