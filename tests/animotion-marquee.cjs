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
    const objects=[{type:'rect',x:.2,y:.4,width:.15,height:.1,color:'#ff0000'},
      {type:'circle',x:.5,y:.4,size:180,color:'#00ff00'},
      {type:'text',text:'Fuera',x:.8,y:.4,size:90,color:'#ffffff'},
      {type:'rect',x:.4,y:.35,width:.1,height:.1,color:'#0000ff',hidden:true}];
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes:[{start:0,end:2,objects}]}));await page.locator('#applyJson').click();
    const indices=()=>page.evaluate(()=>selectionIndices().sort((a,b)=>a-b));
    const point=async(x,y)=>page.locator('#canvas').evaluate((node,{x,y})=>{const r=node.getBoundingClientRect(),scale=Math.min(r.width/node.width,r.height/node.height);return {x:r.left+(r.width-node.width*scale)/2+x*node.width*scale,y:r.top+(r.height-node.height*scale)/2+y*node.height*scale};},{x,y});
    async function box(from,to,{shift=false,cancel=false}={}){
      await page.locator('#canvas').scrollIntoViewIfNeeded();const a=await point(...from),b=await point(...to);
      if(shift)await page.keyboard.down('Shift');await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});
      assert.equal(await page.evaluate(()=>canvasEditor.busy),true);
      if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(shift)await page.keyboard.up('Shift');
      assert.equal(await page.evaluate(()=>canvasEditor.busy),false);
    }
    const model=await page.evaluate(()=>JSON.stringify(project)),history=await page.evaluate(()=>editHistory.length);
    await box([.08,.18],[.62,.58]);assert.deepEqual(await indices(),[0,1]);
    assert.equal(await page.locator('.scene-layer[aria-pressed=true]').count(),2);
    assert.equal(await page.evaluate(()=>JSON.stringify(project)),model);assert.equal(await page.evaluate(()=>editHistory.length),history);
    // Se exige que el objeto entre entero; un borde cruzado no basta.
    await box([.08,.18],[.22,.58]);assert.deepEqual(await indices(),[]);
    await box([.62,.58],[.08,.18]);assert.deepEqual(await indices(),[0,1]);
    await box([.98,.18],[.69,.58],{shift:true});assert.deepEqual(await indices(),[0,1,2]);
    await box([.08,.08],[.1,.1],{shift:true});assert.deepEqual(await indices(),[0,1,2]);
    await box([.08,.08],[.1,.1]);assert.deepEqual(await indices(),[]);
    await box([.08,.18],[.62,.58]);
    await box([.98,.18],[.69,.58],{cancel:true});assert.deepEqual(await indices(),[0,1]);
    assert.equal(await page.evaluate(()=>editHistory.length),history);
    // El grupo elegido por recuadro se arrastra y se deshace como una unidad.
    const a=await point(.2,.4);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+20,a.y+15,{steps:4});await page.mouse.up();
    assert.deepEqual(await indices(),[0,1]);assert.equal(await page.evaluate(()=>editHistory.length),history+1);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>JSON.stringify(project)),model);
    // La transformación del rectángulo también funciona en formato vertical.
    await page.locator('#deselectObject').click();await page.locator('#orientation').selectOption('portrait');
    await box([.08,.18],[.62,.58]);assert.deepEqual(await indices(),[0,1]);
    // Un clic vacío conserva la acción de deseleccionar.
    const empty=await point(.95,.9);await page.mouse.click(empty.x,empty.y);assert.deepEqual(await indices(),[]);
    assert.deepEqual(errors,[]);
    console.log('PASS: recuadro en ambas direcciones, inclusión completa, Shift aditivo, rectángulo vacío, objetos ocultos excluidos, Esc, sin cambios de modelo/historial, arrastre conjunto, Ctrl+Z y vertical.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
