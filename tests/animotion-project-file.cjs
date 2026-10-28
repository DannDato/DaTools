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
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes:[
      {start:5,end:7,objects:[{type:'text',text:'Conservar escala original',size:800}]},
      {start:0,end:4,objects:[{type:'icon',name:'database',size:80},{type:'vector',size:200,shapes:[{kind:'path',points:[{x:-1,y:0},{x:0,y:-1},{x:1,y:0}],strokeWidth:.03}]}]}
    ]}));await page.locator('#applyJson').click();
    await page.locator('#textSizeAdjust').fill('400');await page.locator('#iconSizeAdjust').fill('150');await page.locator('#strokeAdjust').fill('75');await page.locator('#fontFamily').selectOption('Oswald');
    await page.locator('#bg').fill('#224466');await page.locator('#backgroundPreset').selectOption('gradient');await page.locator('#bgEffectColor').fill('#ff33aa');await page.locator('#bgOpacity').fill('70');
    await page.locator('#orientation').selectOption('portrait');await page.locator('#fps').selectOption('60');
    await page.locator('#srtText').fill('1\n00:00:01,000 --> 00:00:03,000\nUn guion que debe conservarse.');await page.locator('#readSrt').click();
    await page.locator('.sceneItem').first().click();
    let scene=JSON.parse(await page.locator('#sceneJsonText').inputValue());scene.start=10;scene.end=12;
    await page.locator('#sceneJsonText').fill(JSON.stringify(scene));await page.locator('#applySceneJson').click();
    await page.locator('.scene-layer[data-object-index="0"]').click();await page.locator('#selectedObjectColor').fill('#123456');await page.locator('#selectedObjectColor').dispatchEvent('change');
    await page.getByRole('button',{name:'Ocultar objeto 2',exact:true}).click();
    await page.locator('.scene-layer[data-object-index="0"]').click();await page.locator('.scene-layer[data-object-index="1"]').click({modifiers:['Shift']});
    await page.locator('#sceneJsonText').fill('{"borrador":"escena sin aplicar"}');
    await page.locator('#jsonText').fill('{ borrador global pendiente');
    await page.locator('#seek').fill('11500');
    const before=await page.evaluate(()=>({scenes:JSON.stringify(project.scenes),base:JSON.stringify(sizeBaseProject.scenes),settings:Object.fromEntries(persistentControls.filter(c=>!['jsonText','srtText'].includes(c.id)).map(c=>[c.id,c.type==='checkbox'?c.checked:globalAppearance(c.id)])),script:document.querySelector('#srtText').value,draft:document.querySelector('#jsonText').value,sceneDraft:document.querySelector('#sceneJsonText').value,selection:selectionIndices(),scene:selectedSceneIndex,position}));
    const downloading=page.waitForEvent('download');await page.locator('#saveProject').click();const file=await downloading;
    const text=await fs.readFile(await file.path(),'utf8'),saved=JSON.parse(text);
    assert.equal(saved.format,'datools-animotion-project');assert.equal(saved.formatVersion,1);assert.equal(saved.scenes.length,2);
    assert.deepEqual(saved.scenes.map(s=>s.start),[10,5]);assert.equal(saved.scenes[1].objects[0].size,800);assert.equal(saved.editor.controls.textSizeAdjust,'400');
    async function loadProject(file){await page.locator('#projectFileInput').setInputFiles(file);await page.waitForFunction(()=>document.querySelector('#projectFileInput').value==='');}
    const input={name:'mi-animacion.json',mimeType:'application/json',buffer:Buffer.from(text)};
    page.once('dialog',dialog=>dialog.dismiss());await loadProject(input);
    assert.equal(await page.evaluate(()=>JSON.stringify(project.scenes)),before.scenes);assert.match(await page.locator('#projectFileStatus').textContent(),/cancelada/);
    // Abrir reemplaza el documento solo después de validar y confirmar.
    await page.locator('#deselectObject').click();await page.locator('#textSizeAdjust').fill('50');await page.locator('#fontFamily').selectOption('Inter');
    await page.locator('#bg').fill('#000000');await page.locator('#backgroundPreset').selectOption('solid');await page.locator('#bgOpacity').fill('10');
    await page.locator('#orientation').selectOption('landscape');await page.locator('#fps').selectOption('30');
    await page.locator('#srtText').fill('Esto será reemplazado');
    page.once('dialog',dialog=>dialog.accept());await loadProject(input);
    assert.match(await page.locator('#projectFileStatus').textContent(),/Proyecto abierto/);
    const restored=await page.evaluate(()=>({scenes:JSON.stringify(project.scenes),base:JSON.stringify(sizeBaseProject.scenes),settings:Object.fromEntries(persistentControls.filter(c=>!['jsonText','srtText'].includes(c.id)).map(c=>[c.id,c.type==='checkbox'?c.checked:globalAppearance(c.id)])),script:document.querySelector('#srtText').value,draft:document.querySelector('#jsonText').value,sceneDraft:document.querySelector('#sceneJsonText').value,selection:selectionIndices(),scene:selectedSceneIndex,position}));
    assert.deepEqual(restored,before);assert.equal(await page.evaluate(()=>editHistory.length),0);assert.equal(await page.evaluate(()=>editHistory.redoLength),0);
    const cleanContext=await browser.newContext(),fresh=await cleanContext.newPage();fresh.on('pageerror',error=>errors.push(error.message));
    await cleanContext.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());await fresh.goto(origin+'/animotion/animotion');
    await fresh.locator('#projectFileInput').setInputFiles(input);await fresh.waitForFunction(()=>document.querySelector('#projectFileInput').value==='');
    assert.match(await fresh.locator('#projectFileStatus').textContent(),/Proyecto abierto/);
    assert.equal(await fresh.evaluate(()=>JSON.stringify(project.scenes)),before.scenes);
    assert.equal(await fresh.evaluate(()=>appearanceGlobals.fontFamily),'Oswald');assert.equal(await fresh.locator('#bg').inputValue(),'#224466');
    assert.equal(await fresh.locator('#jsonText').inputValue(),before.draft);assert.equal(await fresh.locator('#sceneJsonText').inputValue(),before.sceneDraft);
    await cleanContext.close();
    assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].size),1200);
    // La escala original no se pierde aunque el tamaño visible estuviera limitado.
    await page.locator('#deselectObject').click();await page.locator('#textSizeAdjust').fill('100');assert.equal(await page.evaluate(()=>project.scenes[1].objects[0].size),800);
    await page.reload();assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].color),'#123456');assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].hidden),true);
    // Errores o versiones futuras no alteran el proyecto y no piden confirmación.
    const unchanged=await page.evaluate(()=>JSON.stringify(project));
    for(const value of ['{inválido',JSON.stringify({...saved,formatVersion:999}),JSON.stringify({...saved,editor:{...saved.editor,controls:{...saved.editor.controls,fontFamily:'Fuente desconocida'}}})]){
      await loadProject({name:'invalido.json',mimeType:'application/json',buffer:Buffer.from(value)});
      assert.match(await page.locator('#projectFileStatus').textContent(),/No se pudo abrir/);assert.equal(await page.evaluate(()=>JSON.stringify(project)),unchanged);
    }
    // Compatibilidad con el selector JSON existente y con proyectos antiguos de solo escenas.
    page.once('dialog',dialog=>dialog.accept());await page.locator('#jsonFile').setInputFiles(input);await page.waitForFunction(()=>document.querySelector('#jsonFile').value==='');assert.match(await page.locator('#projectFileStatus').textContent(),/Proyecto abierto/);
    page.once('dialog',dialog=>dialog.accept());await loadProject({name:'antiguo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({scenes:[{start:0,end:1,objects:[{type:'text',text:'Proyecto anterior',size:90}]}]}))});
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].text),'Proyecto anterior');assert.equal(await page.evaluate(()=>project.scenes[0].objects[0].size),90);
    const keyboardSave=page.waitForEvent('download');await page.keyboard.press('Control+s');assert.equal((await keyboardSave).suggestedFilename(),'antiguo.json');
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    console.log('PASS: proyecto JSON completo, escenas en su orden, bases y escalas exactas, estilos locales/ocultos, guion, paleta/fuentes/fondo/FPS/formato, borradores, selección/posición, cancelar, validar antes de reemplazar, recarga, legado, importador existente y Ctrl+S.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
