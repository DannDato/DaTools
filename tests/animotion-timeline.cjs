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
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await page.goto(origin+'/animotion/animotion');
    const fixture={fps:30,resolution:[2560,1440],scenes:[{start:0,end:4,objects:[
      {type:'rect',x:.25,y:.5,width:.1,height:.1,color:'#ff0000',enter:'none',idle:'none',duration:.5},
      {type:'circle',x:.75,y:.5,size:200,color:'#0000ff',enter:'none',idle:'none',delay:.5,visibleDuration:2,duration:.5}
    ]},{start:5,end:7,objects:[{type:'text',text:'Otra escena'}]}]};
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify(fixture));await page.locator('#applyJson').click();await page.locator('.sceneItem').first().click();
    assert.ok(await page.locator('.timeline-panel').isVisible());
    const sceneBar='.timebar[data-scene="0"]:not([data-object])',objectBar='.timebar[data-scene="0"][data-object="1"]';
    async function drag(selector,seconds,cancel=false){
      const target=page.locator(selector);await target.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));const rect=await target.boundingBox(),scale=await page.evaluate(()=>timelineEditor.pixelsPerSecond);
      await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+seconds*scale,rect.y+rect.height/2,{steps:7});
      if(cancel)await page.keyboard.press('Escape');await page.mouse.up();
    }
    const initialHistory=await page.evaluate(()=>editHistory.length);
    await drag(sceneBar+' .timebar-end',2);
    assert.equal(await page.evaluate(()=>project.scenes[0].end),6);assert.equal(await page.evaluate(()=>sizeBaseProject.scenes[0].end),6);assert.equal(await page.evaluate(()=>project.scenes[1].start),5);
    assert.equal(await page.evaluate(()=>editHistory.length),initialHistory+1);assert.equal(JSON.parse(await page.locator('#sceneJsonText').inputValue()).end,6);
    await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>project.scenes[0].end),4);await page.keyboard.press('Control+y');assert.equal(await page.evaluate(()=>project.scenes[0].end),6);
    await drag(sceneBar,1);assert.equal(await page.evaluate(()=>project.scenes[0].start),1);assert.equal(await page.evaluate(()=>project.scenes[0].end),7);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].delay),.5);await page.keyboard.press('Control+z');
    await drag(objectBar+' .timebar-end',-1);
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].visibleDuration),1);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].duration),.5);
    // Tiempo visible y entrada son independientes y el renderer respeta el final.
    const pixels=await page.evaluate(()=>{
      canvasEditor.previewAt(.8);const before=Array.from(ctx.getImageData(Math.round(canvas.width*.75),Math.round(canvas.height*.5),1,1).data).slice(0,3);
      canvasEditor.previewAt(1.6);const after=Array.from(ctx.getImageData(Math.round(canvas.width*.75),Math.round(canvas.height*.5),1,1).data).slice(0,3);return {before,after};
    });assert.deepEqual(pixels,{before:[0,0,255],after:[0,0,0]});
    await drag(objectBar+' .timebar-start',.25);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].delay),.75);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].visibleDuration),.75);
    await drag(objectBar,1);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].delay),1.75);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].visibleDuration),.75);
    await drag(objectBar+' .timebar-entry',.2);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].duration),.7);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].visibleDuration),.75);
    assert.equal(await page.getByLabel('Tiempo visible (s)',{exact:true}).inputValue(),'0.75');
    await drag(objectBar+' .timebar-end',5);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].delay+project.scenes[0].objects[1].visibleDuration),6);await page.keyboard.press('Control+z');
    await drag(objectBar+' .timebar-end',-1);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].visibleDuration),.05);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].duration),.05);await page.keyboard.press('Control+z');
    const before=await page.evaluate(()=>JSON.stringify(project)),history=await page.evaluate(()=>editHistory.length);
    await drag(sceneBar+' .timebar-end',1,true);assert.equal(await page.evaluate(()=>JSON.stringify(project)),before);assert.equal(await page.evaluate(()=>editHistory.length),history);
    await page.locator(sceneBar+' .timebar-end').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>project.scenes[0].end),6.2);
    await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>project.scenes[0].end),6);
    // Scrub real y zoom sin modificar el proyecto ni gastar historial.
    await page.locator('.timeline-ruler .timeline-track').scrollIntoViewIfNeeded();
    const ruler=await page.locator('.timeline-ruler .timeline-track').boundingBox(),scale=await page.evaluate(()=>timelineEditor.pixelsPerSecond);
    await page.mouse.click(ruler.x+3.25*scale,ruler.y+8);assert.ok(Math.abs(await page.evaluate(()=>position)-3.25)<.01);assert.equal(await page.evaluate(()=>canvasEditor.editing),false);
    const model=await page.evaluate(()=>JSON.stringify(project));await page.locator('#timelineZoomIn').click();await page.locator('#timelineZoomOut').click();await page.locator('#timelineFit').click();assert.equal(await page.evaluate(()=>JSON.stringify(project)),model);
    const saving=page.waitForEvent('download');await page.locator('#saveProject').click();const saved=JSON.parse(await fs.readFile(await (await saving).path(),'utf8'));
    assert.equal(saved.scenes[0].objects[1].visibleDuration,.75);assert.equal(saved.scenes[0].objects[1].duration,.7);
    await page.reload();assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].visibleDuration),.75);assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].duration),.7);
    await page.locator('#srtText').fill('1\n00:00:00,000 --> 00:00:20,000\nReferencia más larga que la animación.');await page.locator('#readSrt').click();
    assert.equal(await page.evaluate(()=>duration),7);
    assert.equal(await page.evaluate(()=>validate({scenes:[{start:0,end:80,objects:[{type:'circle',delay:45,visibleDuration:5}]}]}).scenes[0].objects[0].delay),45);
    if(process.env.SCREENSHOT_DIR){await page.locator('.timeline-panel').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'animotion-timeline.png')});}
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
    console.log('PASS: mover/recortar escenas, tiempos relativos, duración visible independiente, renderer antes/después, entrada arrastrable, límites, Esc, teclado, scrub, zoom, Ctrl+Z/Rehacer, JSON/proyecto/recarga y móvil.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
