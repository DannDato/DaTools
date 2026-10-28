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
    const scenes=Array.from({length:200},(_,index)=>({start:index*2,end:index*2+2,objects:[
      {type:'text',text:'Un proyecto grande para probar el color',x:.5,y:.2,size:100},
      {type:'vector',x:.3,y:.5,size:200,shapes:[{kind:'line',points:[{x:-1,y:0},{x:1,y:0}]}]},
      {type:'icon',name:'database',x:.7,y:.5,size:80},
      {type:'rect',x:.5,y:.7,width:.2,height:.1}
    ]}));
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes}));
    await page.locator('#applyJson').click();await page.locator('.sceneItem').first().click();
    for(const id of ['orientation','fps','bg','accent','elementColor2','vectorColor','backgroundPreset','bgOpacity','applyGlobalPalette','iconSizeAdjust','strokeAdjust'])assert.ok(await page.locator('#'+id).isHidden(),id+' debe ocultarse para texto');
    for(const id of ['selectedObjectColor','fg','fontFamily','textSizeAdjust'])assert.ok(await page.locator('#'+id).isVisible(),id+' debe mostrarse para texto');
    const measured=await page.evaluate(async()=>{
      const counts={editor:0,json:0,storage:0,validate:0,render:0};
      const oldEditor=renderSceneEditor,oldJson=syncProjectJson,oldStorage=Storage.prototype.setItem,oldValidate=validate,oldRender=render;
      renderSceneEditor=(...args)=>{counts.editor++;return oldEditor(...args);};syncProjectJson=(...args)=>{counts.json++;return oldJson(...args);};
      Storage.prototype.setItem=function(...args){counts.storage++;return oldStorage.apply(this,args);};validate=(...args)=>{counts.validate++;return oldValidate(...args);};render=(...args)=>{counts.render++;return oldRender(...args);};
      const sidebar=document.querySelector('#selectedObjectColor'),form=document.querySelector('.scene-object-editor input[type=color]'),history=editHistory.length;
      const started=performance.now();
      for(let i=0;i<80;i++){sidebar.value='#'+(0x220000+i).toString(16);sidebar.dispatchEvent(new Event('input',{bubbles:true}));}
      const inputMs=performance.now()-started,during={...counts};
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const preview={...counts};
      const commitStart=performance.now();sidebar.dispatchEvent(new Event('change',{bubbles:true}));
      const commitMs=performance.now()-commitStart,committed={...counts};
      return {during,preview,committed,inputMs,commitMs,sameForm:form===document.querySelector('.scene-object-editor input[type=color]'),formColor:form.value,modelColor:project.scenes[0].objects[0].color,jsonColor:JSON.parse(document.querySelector('#jsonText').value).scenes[0].objects[0].color,historyDelta:editHistory.length-history};
    });
    assert.equal(measured.during.editor,0);assert.equal(measured.during.json,0);assert.equal(measured.during.storage,0);assert.equal(measured.during.validate,0);
    assert.equal(measured.preview.render,1);assert.equal(measured.committed.editor,0);assert.equal(measured.committed.json,1);assert.equal(measured.committed.storage,1);assert.equal(measured.committed.validate,0);
    assert.equal(measured.sameForm,true);assert.equal(measured.formColor,measured.modelColor);assert.equal(measured.jsonColor,measured.modelColor);assert.equal(measured.historyDelta,1);
    // Lo mismo desde el selector inferior, sin destruir su nodo ni su diálogo nativo.
    const lower=await page.evaluate(()=>{
      const input=document.querySelector('.scene-object-editor input[type=color]');input.value='#abcdef';input.dispatchEvent(new Event('input',{bubbles:true}));
      const same=input===document.querySelector('.scene-object-editor input[type=color]');input.dispatchEvent(new Event('change',{bubbles:true}));return {same,value:document.querySelector('#selectedObjectColor').value};
    });assert.deepEqual(lower,{same:true,value:'#abcdef'});
    await page.locator('.scene-layer[data-object-index="1"]').click();
    for(const id of ['vectorColor','iconSizeAdjust','strokeAdjust'])assert.ok(await page.locator('#'+id).isVisible());
    for(const id of ['fg','accent','elementColor2','fontFamily','textSizeAdjust','orientation','backgroundPreset'])assert.ok(await page.locator('#'+id).isHidden());
    await page.locator('.scene-layer[data-object-index="2"]').click();assert.ok(await page.locator('#strokeAdjust').isHidden());
    await page.locator('.scene-layer[data-object-index="3"]').click();assert.ok(await page.locator('#strokeAdjust').isHidden());assert.ok(await page.locator('#accent').isVisible());assert.ok(await page.locator('#elementColor2').isVisible());
    await page.locator('#deselectObject').click();
    for(const id of ['orientation','fps','bg','fg','accent','elementColor2','vectorColor','fontFamily','backgroundPreset','bgOpacity','applyGlobalPalette','textSizeAdjust','iconSizeAdjust','strokeAdjust'])assert.ok(await page.locator('#'+id).isVisible(),id+' debe volver al deseleccionar');
    await page.locator('#backgroundPreset').selectOption('aurora');
    const allColors=await page.evaluate(async()=>{
      const results=[];
      for(const id of ['bg','bgEffectColor','bgEffectColor2','fg','accent','elementColor2','vectorColor']){
        const counts={render:0,storage:0,json:0,editor:0},original={render,syncProjectJson,renderSceneEditor,storage:Storage.prototype.setItem};
        render=(...args)=>{counts.render++;return original.render(...args);};
        syncProjectJson=(...args)=>{counts.json++;return original.syncProjectJson(...args);};
        renderSceneEditor=(...args)=>{counts.editor++;return original.renderSceneEditor(...args);};
        Storage.prototype.setItem=function(...args){counts.storage++;return original.storage.apply(this,args);};
        const input=document.getElementById(id),start=performance.now();
        for(let i=0;i<80;i++){input.value='#'+(0x330000+i).toString(16);input.dispatchEvent(new Event('input',{bubbles:true}));}
        const during={...counts},inputMs=performance.now()-start;
        await new Promise(resolve=>requestAnimationFrame(resolve));
        input.dispatchEvent(new Event('change',{bubbles:true}));results.push({id,during,committed:{...counts},inputMs});
        render=original.render;syncProjectJson=original.syncProjectJson;renderSceneEditor=original.renderSceneEditor;Storage.prototype.setItem=original.storage;
      }
      return results;
    });
    for(const result of allColors){
      assert.equal(result.during.storage,0,result.id+' sin guardados durante arrastre');
      assert.equal(result.during.json,0,result.id+' sin serializar durante arrastre');
      assert.equal(result.committed.render,1,result.id+' un render');
      assert.equal(result.committed.storage,1,result.id+' un guardado');assert.equal(result.committed.editor,0);
      if(['bg','bgEffectColor','bgEffectColor2'].includes(result.id))assert.equal(result.committed.json,0);
    }
    // Un ajuste del fondo no sobrescribe un borrador JSON sin aplicar.
    await page.locator('#jsonText').fill('{ borrador pendiente');
    await page.locator('#bgEffectColor').fill('#987654');await page.locator('#bgEffectColor').dispatchEvent('change');
    assert.equal(await page.locator('#jsonText').inputValue(),'{ borrador pendiente');
    console.log('PASS: los siete colores globales/fondo agrupan 80 entradas en un render y un guardado; los fondos conservan borradores JSON.');
    assert.deepEqual(errors,[]);
    console.log(`PASS: 800 objetos; 80 cambios de color → 1 render de previsualización, 1 serialización/guardado, 0 validaciones y 0 reconstrucciones del formulario; ${measured.inputMs.toFixed(1)} ms de entrada, ${measured.commitMs.toFixed(1)} ms de confirmación. Sincronización y controles contextuales verificados.`);
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
