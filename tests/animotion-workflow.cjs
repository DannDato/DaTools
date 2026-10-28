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
    browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const origin='http://127.0.0.1:'+server.address().port;
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin+'/animotion/animotion');await page.waitForFunction(()=>typeof workflow!=='undefined');
    assert.equal(await page.evaluate(()=>workflow.stage),'create');
    assert.ok(await page.locator('.dock-project').isVisible());assert.ok(!await page.locator('.dock-preview').isVisible());
    assert.ok(await page.locator('#step-edit').isDisabled());
    // Los presets usan los controles originales y Personalizar los revela sin perder valores.
    await page.locator('#workflowPreset').selectOption('technical');
    assert.equal(await page.locator('#drawingStyle').inputValue(),'technical');
    assert.ok(!await page.locator('#drawingStyle').isVisible());await page.locator('#customizePrompt').click();
    assert.ok(await page.locator('#drawingStyle').isVisible());
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/animotion-workflow-create.png',fullPage:true});
    await page.locator('#jsonCode summary').click();
    await page.locator('#jsonText').fill(JSON.stringify({fps:30,scenes:[{start:0,end:.6,objects:[{type:'rect',x:.4,y:.4,width:.2,height:.2,color:'#ff0000',duration:.1}]}]}));
    await page.locator('#applyJson').click();assert.equal(await page.evaluate(()=>workflow.stage),'edit');
    assert.ok(await page.evaluate(()=>canvasEditor.editing));assert.ok(await page.locator('#canvas').isVisible());
    assert.ok(!await page.locator('#srtText').isVisible());assert.ok(!await page.locator('.timeline-panel').isVisible());
    // Selección real sobre el canvas abre el inspector de ese objeto.
    const box=await page.locator('#canvas').boundingBox();await page.mouse.click(box.x+box.width*.4,box.y+box.height*.4);
    assert.equal(await page.evaluate(()=>selectedObjectIndex),0);assert.ok(await page.locator('.scene-object-editor').isVisible());
    assert.ok(!await page.locator('.dock-appearance').isVisible());
    await page.locator('[data-inspector=appearance]').click();await page.locator('#selectedObjectColor').fill('#123456');
    await page.locator('#selectedObjectColor').dispatchEvent('change');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].color),'#123456');
    assert.ok(await page.locator('.topbar .history-undo').first().isVisible());
    await page.getByRole('button',{name:'Deshacer cambio',exact:true}).click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].color),'#ff0000');
    await page.getByRole('button',{name:'Rehacer cambio',exact:true}).click();
    // Crear no debe mantener activos los atajos del lienzo que ahora está oculto.
    await page.locator('#step-create').click();await page.locator('#step-create').focus();await page.keyboard.press('Backspace');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].hidden),false,'Backspace fuera de Editar no oculta objetos');
    await page.locator('#step-edit').click();await page.locator('#pencilTool').click();
    await page.locator('#step-create').click();assert.equal(await page.evaluate(()=>pencilTool.active),false,'Salir de Editar desactiva el lápiz');
    await page.locator('#step-edit').click();
    await page.locator('#toggleTimeline').click();assert.ok(await page.locator('.timeline-panel').isVisible());
    await page.locator('[data-inspector=json]').click();assert.ok(await page.locator('#sceneJsonText').isVisible());
    assert.ok(!await page.locator('.scene-object-editor').isVisible());
    const scene=await page.evaluate(()=>JSON.parse(JSON.stringify(project.scenes[0])));scene.objects[0].x=.6;
    await page.locator('#sceneJsonText').fill(JSON.stringify(scene));await page.locator('#applySceneJson').click();
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].x),.6);
    // Un borrador por escena sobrevive al cambio de etapa, pestaña y recarga.
    await page.locator('#sceneJsonText').fill('{borrador pendiente');
    await page.locator('#step-create').click();await page.locator('#step-edit').click();
    assert.equal(await page.locator('#sceneJsonText').inputValue(),'{borrador pendiente');
    await page.waitForTimeout(350);await page.reload();await page.waitForFunction(()=>typeof workflow!=='undefined');
    assert.equal(await page.locator('#sceneJsonText').inputValue(),'{borrador pendiente');
    assert.ok(await page.locator('.timeline-panel').isVisible());
    page.once('dialog',dialog=>dialog.accept());await page.locator('#resetSceneJson').click();
    await page.locator('[data-inspector=appearance]').click();
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/animotion-workflow.png',fullPage:true});
    // Guardar/Abrir permanece accesible y conserva el proyecto desde el flujo guiado.
    const saving=page.waitForEvent('download');await page.locator('#saveProject').click();
    const saved=await saving,projectBytes=await fs.readFile(await saved.path());
    page.once('dialog',dialog=>dialog.accept());await page.locator('#projectFileInput').setInputFiles({name:'flujo.json',mimeType:'application/json',buffer:projectBytes});
    await page.waitForFunction(()=>document.querySelector('#projectFileInput').value==='');
    assert.equal(await page.evaluate(()=>workflow.stage),'edit');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].x),.6);
    await page.locator('#step-export').click();
    assert.ok(await page.locator('#workflowExport').isVisible());assert.ok(await page.locator('#orientation').isVisible());
    assert.ok(!await page.locator('#bg').isVisible());assert.ok(!await page.locator('#pencilTool').isVisible());
    assert.ok(!await page.evaluate(()=>canvasEditor.editing));
    const downloading=page.waitForEvent('download',{timeout:60000});await page.locator('#workflowExport').click();
    const video=await downloading;assert.ok((await fs.stat(await video.path())).size>1000);
    await page.waitForFunction(()=>!exporting);
    await page.reload();assert.equal(await page.evaluate(()=>workflow.stage),'export');
    await page.setViewportSize({width:390,height:844});
    for(const step of ['create','edit','export']){
      await page.locator('#step-'+step).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.locator('#step-edit').click();
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:process.env.SCREENSHOT_DIR+'/animotion-workflow-mobile.png',fullPage:true});
    await page.locator('.workflow-options summary').click();await page.locator('[data-step=free]').click();
    assert.equal(await page.evaluate(()=>workflow.stage),'free');assert.ok(await page.locator('#srtText').isVisible());
    assert.ok(await page.locator('#drawingStyle').isVisible());assert.equal(await page.locator('#animotionDock > [data-dock]').count(),6);
    await page.locator('#step-create').click();await page.locator('.workflow-options summary').click();await page.locator('[data-step=free]').click();
    assert.equal(await page.locator('#animotionDock > [data-dock]').count(),6);assert.deepEqual(errors,[]);
    // Sin proyecto también se puede dibujar sin pasar por la IA.
    const fresh=await browser.newPage();
    await fresh.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await fresh.goto(origin+'/animotion/animotion?step=create');
    await fresh.locator('#workflowBlank').click();assert.equal(await fresh.evaluate(()=>workflow.stage),'edit');
    assert.equal(await fresh.evaluate(()=>project.scenes[0].objects.length),0);assert.ok(await fresh.locator('#pencilTool').isVisible());
    await fresh.getByRole('button',{name:'Deshacer cambio',exact:true}).click();
    await fresh.waitForFunction(()=>workflow.stage==='create');
    assert.equal(await fresh.evaluate(()=>project.scenes.length),0);assert.ok(await fresh.locator('#step-edit').isDisabled());
    await fresh.getByRole('button',{name:'Rehacer cambio',exact:true}).click();await fresh.locator('#step-edit').click();
    assert.equal(await fresh.evaluate(()=>project.scenes.length),1);
    console.log('PASS: Crear/Editar/Exportar, presets, canvas e inspector, color, historial, JSON y borradores, timeline plegable, guardar/abrir, video real, recarga, móvil, Vista libre y proyecto en blanco.');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
