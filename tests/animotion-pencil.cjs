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
    const point=async(x,y)=>page.locator('#canvas').evaluate((node,{x,y})=>{
      const r=node.getBoundingClientRect(),s=Math.min(r.width/node.width,r.height/node.height);
      return {x:r.left+(r.width-node.width*s)/2+x*node.width*s,y:r.top+(r.height-node.height*s)/2+y*node.height*s};
    },{x,y});
    async function draw(from,to){
      await page.locator('#canvas').scrollIntoViewIfNeeded();const a=await point(...from),b=await point(...to);
      await page.mouse.move(a.x,a.y);await page.mouse.down();
      for(let i=1;i<=20;i++)await page.mouse.move(a.x+(b.x-a.x)*i/20,a.y+(b.y-a.y)*i/20+Math.sin(i/20*Math.PI*2)*12);
      await page.mouse.up();
    }
    await page.locator('#pencilTool').click();await page.locator('#pencilColor').fill('#ff5500');await page.locator('#pencilWidth').fill('8');
    await draw([.2,.3],[.6,.6]);
    assert.equal(await page.evaluate(()=>project.scenes.length),1);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),1);
    let object=await page.evaluate(()=>project.scenes[0].objects[0]);
    assert.equal(object.type,'vector');assert.equal(object.enter,'draw');assert.equal(object.idle,'none');assert.equal(object.color,'#ff5500');
    assert.ok(object.shapes[0].points.length>=3&&object.shapes[0].points.length<21);
    assert.equal(await page.evaluate(()=>editHistory.length),1);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>project.scenes.length),0);
    await draw([.2,.3],[.6,.6]);await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>pencilTool.active),false);
    await page.getByLabel('Retraso (s)',{exact:true}).fill('.4');await page.getByLabel('Duración entrada (s)',{exact:true}).fill('.8');
    await page.getByLabel('Grosor del dibujo',{exact:true}).fill('.02');
    assert.equal(await page.evaluate(()=>sizeBaseProject.scenes[0].objects[0].shapes[0].strokeWidth),.02);
    const jsonDownloading=page.waitForEvent('download');await page.locator('#downloadJson').click();
    object=JSON.parse(await fs.readFile(await (await jsonDownloading).path(),'utf8')).scenes[0].objects[0];
    assert.equal(object.delay,.4);assert.equal(object.duration,.8);assert.equal(object.shapes[0].strokeWidth,.02);
    await page.reload();assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].shapes[0].strokeWidth),.02);
    // La escena elegida recibe el trazo, incluso si su tiempo no empieza en cero.
    await page.locator('#jsonCode summary').click();
    await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes:[{start:0,end:2,objects:[]},{start:2,end:4,objects:[]}]}));
    await page.locator('#applyJson').click();await page.locator('.sceneItem').nth(1).click();await page.locator('#pencilTool').click();
    await draw([.03,.2],[.97,.8]);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects.length),0);
    assert.equal(await page.evaluate(()=>project.scenes[1].objects.length),1);
    assert.ok(await page.evaluate(()=>project.scenes[1].objects[0].size>1200));
    assert.ok(await page.evaluate(()=>validate(JSON.parse(document.querySelector('#jsonText').value)).scenes[1].objects[0].size>1200));
    await page.locator('#deselectObject').click();await page.locator('#orientation').selectOption('portrait');await draw([.3,.05],[.7,.95]);
    assert.equal(await page.evaluate(()=>project.scenes[1].objects.length),2);
    assert.ok(await page.evaluate(()=>project.scenes[1].objects[1].size>1200));
    // Esc descarta el gesto sin crear una capa o un paso de historial.
    await page.locator('#canvas').scrollIntoViewIfNeeded();const a=await point(.2,.2),b=await point(.8,.8);
    const history=await page.evaluate(()=>editHistory.length);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.evaluate(()=>project.scenes[1].objects.length),2);assert.equal(await page.evaluate(()=>editHistory.length),history);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Ocultar objeto 2',exact:true}).click();
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[1].hidden),true);
    await page.locator('#canvas').focus();await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[1].hidden),false);
    const exporting=page.waitForEvent('download');await page.locator('#exportVideo').click();
    const video=await exporting;assert.ok((await fs.stat(await video.path())).size>1000);
    await page.waitForFunction(()=>document.querySelector('#renderOverlay').hidden);
    await page.reload();assert.equal(await page.evaluate(()=>project.scenes[1].objects.length),2);
    assert.deepEqual(errors,[]);
    console.log('PASS: lápiz en proyecto vacío, vector simplificado, color/grosor, un paso por trazo, Ctrl+Z, parámetros, JSON/recarga, escena seleccionada, trazos grandes, vertical, Esc, visibilidad y video.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
