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
    const objects=()=>[{type:'text',text:'Texto',x:.5,y:.2,size:100,color:'#ffffff'},
      {type:'rect',x:.25,y:.4,width:.2,height:.2,color:'#aa98ff'},
      {type:'circle',paletteSlot:'secondary',x:.7,y:.4,size:100,color:'#5a8dff'},
      {type:'vector',x:.5,y:.7,size:100,color:'#aa98ff',shapes:[{kind:'line',points:[{x:-1,y:0},{x:1,y:0}]}]}];
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes:[{start:0,end:2,objects:objects()},{start:2,end:4,objects:objects()}]}));
    await page.locator('#applyJson').click();
    for(const [id,color] of [['fg','#ff0000'],['accent','#00ff00'],['elementColor2','#0000ff'],['vectorColor','#ffff00']])await page.locator('#'+id).fill(color);
    assert.deepEqual(await page.evaluate(()=>project.scenes.map(scene=>scene.objects.map(object=>object.color))),[['#ff0000','#00ff00','#0000ff','#ffff00'],['#ff0000','#00ff00','#0000ff','#ffff00']]);
    await page.locator('.sceneItem').first().click();await page.locator('.scene-layer[data-object-index="1"]').click();
    assert.ok(await page.locator('#vectorColor').isDisabled());
    await page.locator('#elementColor2').fill('#8844ff');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].paletteSlot),'secondary');
    await page.locator('#deselectObject').click();await page.locator('#elementColor2').fill('#00ffff');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].color),'#8844ff');
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[2].color),'#00ffff');
    await page.locator('.scene-layer[data-object-index="1"]').click();await page.locator('#inheritAppearance').click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].color),'#00ffff');
    await page.locator('#duplicateObject').click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),5);
    assert.equal(await page.evaluate(()=>selectedObjectIndex),4);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[4].individualStyle),true);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[4].paletteSlot),'secondary');
    assert.ok(await page.evaluate(()=>project.scenes[0].objects[4].x>project.scenes[0].objects[1].x));
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),4);
    assert.equal(await page.evaluate(()=>selectedObjectIndex),1);
    await page.getByRole('button',{name:'Traer al frente',exact:true}).click();
    assert.equal(await page.evaluate(()=>selectedObjectIndex),3);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[3].type),'rect');
    assert.equal(await page.evaluate(()=>sizeBaseProject.scenes[0].objects[3].type),'rect');
    await page.getByRole('button',{name:'Enviar al fondo',exact:true}).click();assert.equal(await page.evaluate(()=>selectedObjectIndex),0);
    await page.getByRole('button',{name:'Subir una capa',exact:true}).click();assert.equal(await page.evaluate(()=>selectedObjectIndex),1);
    await page.getByRole('button',{name:'Centrar horizontalmente',exact:true}).click();
    await page.getByRole('button',{name:'Centrar verticalmente',exact:true}).click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].x),.5);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].y),.5);
    await page.getByRole('button',{name:'Alinear a la izquierda',exact:true}).click();
    assert.ok(await page.evaluate(()=>Math.abs(canvasEditor.selectionBounds().left-Math.min(canvas.width,canvas.height)*.055)<.01));
    await page.getByRole('button',{name:'Alinear abajo',exact:true}).click();
    assert.ok(await page.evaluate(()=>Math.abs(canvasEditor.selectionBounds().bottom-(canvas.height-Math.min(canvas.width,canvas.height)*.055))<.01));
    const prompt=await page.evaluate(()=>buildPrompt([{start:0,end:2,text:'Prueba de paleta.'}]));assert.ok(prompt.includes('paletteSlot'));assert.ok(prompt.includes('#00FFFF'));assert.ok(prompt.includes('#FFFF00'));
    await page.reload();assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].paletteSlot),'secondary');
    assert.equal(await page.evaluate(()=>appearanceGlobals.vectorColor),'#ffff00');
    assert.deepEqual(errors,[]);
    console.log('PASS: cuatro grupos de color, alcance por tipo/multiescena, color secundario local, protección/herencia, duplicar y Ctrl+Z, orden de capas, alineación real, prompt y persistencia.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
