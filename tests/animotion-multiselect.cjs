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
    await page.goto(origin+'/animotion/animotion');
    const objects=()=>[{type:'rect',x:.2,y:.4,width:.15,height:.1,color:'#ff0000',enter:'none',idle:'none'},
      {type:'circle',x:.5,y:.4,size:180,color:'#00ff00',enter:'none',idle:'none'},
      {type:'text',text:'Grupo',x:.75,y:.4,size:90,color:'#ffffff',enter:'none',idle:'none'},
      {type:'rect',x:.5,y:.75,width:.1,height:.1,color:'#0000ff',enter:'none',idle:'none'}];
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes:[{start:0,end:2,objects:objects()},{start:2,end:4,objects:objects()}]}));await page.locator('#applyJson').click();
    const indices=()=>page.evaluate(()=>selectionIndices().sort((a,b)=>a-b));
    const point=async(x,y)=>page.locator('#canvas').evaluate((node,{x,y})=>{const r=node.getBoundingClientRect(),scale=Math.min(r.width/node.width,r.height/node.height);return {x:r.left+(r.width-node.width*scale)/2+x*node.width*scale,y:r.top+(r.height-node.height*scale)/2+y*node.height*scale,scale};},{x,y});
    async function click(x,y,shift=false){await page.locator('#canvas').scrollIntoViewIfNeeded();const p=await point(x,y);if(shift)await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);if(shift)await page.keyboard.up('Shift');}
    await click(.2,.4);await click(.5,.4,true);await click(.75,.4,true);assert.deepEqual(await indices(),[0,1,2]);
    assert.equal(await page.locator('.scene-layer[aria-pressed=true]').count(),3);assert.match(await page.locator('#appearanceScope').textContent(),/3 objetos/);
    assert.equal(await page.locator('.scene-object-editor').count(),0);
    await click(.5,.4,true);assert.deepEqual(await indices(),[0,2]);await click(.5,.4,true);
    const history=await page.evaluate(()=>editHistory.length);
    const original=await page.evaluate(()=>project.scenes[0].objects.map(o=>({x:o.x,y:o.y})));
    const p=await point(.2,.4);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+40,p.y+20,{steps:8});await page.mouse.up();
    const moved=await page.evaluate(()=>project.scenes[0].objects.map(o=>({x:o.x,y:o.y})));
    for(const i of [0,1,2]){assert.ok(Math.abs(moved[i].x-original[i].x-40/(2560*p.scale))<.000001);assert.ok(Math.abs(moved[i].y-original[i].y-20/(1440*p.scale))<.000001);}
    assert.deepEqual(moved[3],original[3]);assert.equal(await page.evaluate(()=>editHistory.length),history+1);
    await page.keyboard.press('Control+z');assert.deepEqual(await indices(),[0,1,2]);
    assert.deepEqual(await page.evaluate(()=>project.scenes[0].objects.map(o=>({x:o.x,y:o.y}))),original);
    await page.keyboard.press('Backspace');assert.deepEqual(await page.evaluate(()=>project.scenes[0].objects.map(o=>o.hidden)),[true,true,true,false]);
    await page.keyboard.press('Backspace');assert.deepEqual(await page.evaluate(()=>project.scenes[0].objects.map(o=>o.hidden)),[false,false,false,false]);
    await page.locator('#selectedObjectColor').fill('#13579b');await page.locator('#selectedObjectColor').dispatchEvent('change');
    assert.deepEqual(await page.evaluate(()=>project.scenes[0].objects.map(o=>o.color)),['#13579b','#13579b','#13579b','#0000ff']);
    await page.locator('#canvas').focus();await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].color),'#ff0000');
    await page.locator('#duplicateObject').click();assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),7);assert.deepEqual(await indices(),[4,5,6]);
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),4);assert.deepEqual(await indices(),[0,1,2]);
    await page.getByRole('button',{name:'Traer al frente',exact:true}).click();assert.deepEqual(await indices(),[1,2,3]);assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].y),.75);
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();assert.deepEqual(await indices(),[0,1,2]);
    await page.getByRole('button',{name:'Centrar horizontalmente',exact:true}).click();
    assert.ok(await page.evaluate(()=>Math.abs((canvasEditor.selectionBounds().left+canvasEditor.selectionBounds().right)/2-canvas.width/2)<.01));
    assert.ok(await page.evaluate(()=>Math.abs((project.scenes[0].objects[1].x-project.scenes[0].objects[0].x)-.3)<.000001));
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();
    // Cancelar un arrastre revierte todos los miembros y no añade historial.
    await page.locator('#canvas').scrollIntoViewIfNeeded();const a=await point(.2,.4),beforeCancel=await page.evaluate(()=>editHistory.length);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+20,a.y+15,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();
    assert.deepEqual(await page.evaluate(()=>project.scenes[0].objects.map(o=>({x:o.x,y:o.y}))),original);assert.equal(await page.evaluate(()=>editHistory.length),beforeCancel);
    await page.reload();assert.deepEqual(await indices(),[0,1,2]);
    await page.locator('.scene-layer[data-object-index="0"]').click();await page.locator('.scene-layer[data-object-index="3"]').click({modifiers:['Shift']});assert.deepEqual(await indices(),[0,3]);
    await page.locator('.sceneItem').nth(1).click();assert.deepEqual(await indices(),[0]);
    await page.locator('#canvas').focus();await page.keyboard.press('Escape');assert.deepEqual(await indices(),[]);
    assert.match(await page.locator('#appearanceScope').textContent(),/Todas las escenas/);
    await click(.2,.4);await click(.5,.4,true);assert.deepEqual(await indices(),[0,1]);await click(.2,.4);assert.deepEqual(await indices(),[0]);
    assert.deepEqual(errors,[]);
    console.log('PASS: Shift+clic en canvas y capas, añadir/quitar, clic simple, movimiento conjunto, distancia relativa, un paso de historial, Ctrl+Z, color, visibilidad, duplicado, orden, alineación, cancelación, recarga y separación por escena.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
