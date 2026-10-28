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
    assert.ok(await page.getByRole('button',{name:'Rehacer cambio',exact:true}).isDisabled());
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes:[{start:0,end:2,objects:[{type:'rect',x:.2,y:.4,width:.15,height:.1,color:'#ff0000'},{type:'circle',x:.5,y:.4,size:180,color:'#00ff00'}]}]}));await page.locator('#applyJson').click();
    await page.locator('.sceneItem').first().click();await page.locator('.scene-layer[data-object-index="0"]').click();await page.locator('#canvas').focus();
    for(let i=0;i<25;i++)await page.keyboard.press('ArrowRight');
    const finalX=await page.evaluate(()=>project.scenes[0].objects[0].x);
    for(let i=0;i<20;i++)await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>editHistory.redoLength),20);
    for(let i=0;i<20;i++)await page.keyboard.press(i%2?'Control+y':'Control+Shift+z');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].x),finalX);
    assert.equal(await page.evaluate(()=>editHistory.length),20);assert.equal(await page.evaluate(()=>editHistory.redoLength),0);
    await page.keyboard.press('Control+y');assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].x),finalX);
    // Seleccionar otro objeto no invalida Rehacer.
    await page.keyboard.press('Control+z');await page.locator('.scene-layer[data-object-index="1"]').click();
    assert.equal(await page.evaluate(()=>editHistory.redoLength),1);
    await page.getByRole('button',{name:'Rehacer cambio',exact:true}).click();assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].x),finalX);
    assert.equal(await page.evaluate(()=>selectedObjectIndex),0);
    // Un cambio nuevo descarta la rama anterior, incluso si el color aún está en previsualización.
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();
    await page.locator('.scene-layer[data-object-index="0"]').click();
    await page.locator('#selectedObjectColor').fill('#123456');await page.keyboard.press('Control+y');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].color),'#123456');assert.equal(await page.evaluate(()=>editHistory.redoLength),0);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].color),'#ff0000');
    await page.getByRole('button',{name:'Rehacer cambio',exact:true}).click();assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].color),'#123456');
    // Se restaura el grupo entero, su selección y los estilos individuales.
    await page.locator('.scene-layer[data-object-index="1"]').click({modifiers:['Shift']});await page.locator('#canvas').focus();
    const before=await page.evaluate(()=>project.scenes[0].objects.map(o=>o.y));await page.keyboard.press('ArrowDown');
    const after=await page.evaluate(()=>project.scenes[0].objects.map(o=>o.y));
    await page.keyboard.press('Control+z');assert.deepEqual(await page.evaluate(()=>project.scenes[0].objects.map(o=>o.y)),before);
    await page.keyboard.press('Control+Shift+z');assert.deepEqual(await page.evaluate(()=>project.scenes[0].objects.map(o=>o.y)),after);
    assert.deepEqual(await page.evaluate(()=>selectionIndices().sort()),[0,1]);
    // Un trazo también se puede recuperar exactamente.
    await page.locator('#pencilTool').click();await page.locator('#canvas').scrollIntoViewIfNeeded();
    const box=await page.locator('#canvas').boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.8,{steps:10});await page.mouse.up();
    const drawing=await page.evaluate(()=>JSON.stringify(project.scenes[0].objects.at(-1)));
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),2);
    await page.keyboard.press('Control+y');assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),3);assert.equal(await page.evaluate(()=>JSON.stringify(project.scenes[0].objects.at(-1))),drawing);
    await page.keyboard.press('Control+z');const future=await page.evaluate(()=>editHistory.redoLength);
    await page.locator('#srtText').fill('Texto editable');await page.keyboard.press('Control+y');assert.equal(await page.evaluate(()=>editHistory.redoLength),future);
    assert.deepEqual(errors,[]);
    console.log('PASS: botones, Ctrl+Shift+Z, Ctrl+Y, límite de 20 pasos, selección sin invalidar, rama nueva, color pendiente, grupo completo, trazos y atajos nativos en textarea.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
