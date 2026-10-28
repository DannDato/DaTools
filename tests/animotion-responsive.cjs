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
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    const origin='http://127.0.0.1:'+server.address().port;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(origin+'/animotion/animotion?step=create');
    await page.locator('#jsonCode summary').click();
    const objects=Array.from({length:30},(_,i)=>({type:'text',text:'Objeto largo de prueba '+i,x:.5,y:.5,size:80}));
    await page.locator('#jsonText').fill(JSON.stringify({scenes:Array.from({length:24},(_,i)=>({start:i*2,end:(i+1)*2,objects}))}));
    await page.locator('#applyJson').click();
    for(const [width,height] of [[320,740],[360,640],[390,844],[768,1024],[820,1180],[1024,600],[1280,720],[1440,900],[1920,1080],[844,390]]){
      await page.setViewportSize({width,height});
      for(const step of ['create','edit','export']){
        await page.locator('#step-'+step).click();
        if(step!=='create'){
          await page.waitForTimeout(120);
          assert.ok(await page.locator('.workflow-area:not([hidden]) .dock-preview').evaluate(node=>node.getBoundingClientRect().height+document.querySelector('.topbar').getBoundingClientRect().height<=innerHeight-4), 'Vista previa completa '+width+'×'+height+' '+step);
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Desbordamiento ${step}: ${width}×${height}`);
        const header=await page.evaluate(()=>{
          const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
          return {brand:rect('.brand'),tabs:rect('.topbar .workflow-nav'),actions:rect('.project-file-actions')};
        });
        if(width>760)assert.ok(header.brand.right<=header.tabs.left&&header.tabs.right<=header.actions.left,`Encabezado solapado ${width}`);
        else assert.ok(header.brand.right<=header.actions.left&&header.tabs.top>=header.brand.bottom&&header.tabs.top>=header.actions.bottom,`Navbar móvil solapado ${width}`);
      }
      await page.locator('#step-create').click();
      if(await page.locator('#customizePrompt').getAttribute('aria-expanded')==='false')await page.locator('#customizePrompt').click();
      const custom=await page.locator('#workflowCustom').boundingBox();assert.ok(custom.height>230,`Personalizar colapsado ${width}×${height}`);
      assert.equal(await page.locator('.workflow-create .dock-heading').first().evaluate(node=>getComputedStyle(node).position),'static');
      await page.locator('#step-edit').click();await page.locator('.sceneItem').first().click();
      assert.equal(await page.locator('.scene-layers').evaluate(node=>node.scrollHeight>node.clientHeight+1),false,'Capas sin scroll anidado');
      if(width<=980||height<=650){
        assert.equal(await page.locator('.workflow-inspector-content').evaluate(node=>node.scrollHeight>node.clientHeight+1),false,'La página lleva el scroll');
      }
      await page.locator('[data-inspector=json]').click();
      const json=await page.locator('#sceneJsonText').boundingBox();assert.ok(json.height>=140,`Código recortado ${width}×${height}`);
      assert.equal(await page.locator('.workflow-inspector-content').evaluate(node=>node.scrollHeight>node.clientHeight+1),false,'JSON sin segundo scroll vertical: '+JSON.stringify(await page.locator('.workflow-inspector-content').evaluate(node=>({height:node.clientHeight,scroll:node.scrollHeight,children:[...node.querySelectorAll('#sceneEditor,.scene-code-panel,#sceneJsonText')].map(n=>({cls:n.className,id:n.id,h:n.clientHeight,s:n.scrollHeight,css:getComputedStyle(n).height,min:getComputedStyle(n).minHeight}))}))));
      assert.ok(await page.locator('#sceneJsonText').evaluate(node=>node.scrollHeight>node.clientHeight),'JSON conserva su scroll');
      await page.locator('[data-inspector=object]').click();
      assert.equal(await page.locator('.workflow-inspector-content').evaluate(node=>node.scrollTop),0);
      await page.locator('[data-inspector=appearance]').click();
      if(process.env.SCREENSHOT_DIR&&[320,768,1280].includes(width)){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:process.env.SCREENSHOT_DIR+`/animotion-polish-${width}.png`,fullPage:true});}
    }
    // La rueda sale del inspector al llegar al borde; no atrapa el scroll de la página.
    await page.setViewportSize({width:1440,height:900});await page.locator('#step-edit').click();
    const saving=page.waitForEvent('download');await page.locator('#saveProject').click();await saving;
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);
    assert.ok(await page.locator('.workflow-edit .dock-preview').evaluate(node=>node.getBoundingClientRect().bottom<=innerHeight),'También cabe cuando aparece el aviso de Guardar/Abrir');
    await page.locator('#pencilTool').click();await page.waitForTimeout(150);
    assert.ok(await page.locator('.workflow-edit .dock-preview').evaluate(node=>node.getBoundingClientRect().bottom<=innerHeight),'Lápiz también cabe en altura');
    await page.locator('#pencilTool').click();
    await page.locator('#step-export').click();await page.locator('#orientation').selectOption('portrait');await page.waitForTimeout(150);
    assert.ok(await page.locator('.workflow-export .dock-preview').evaluate(node=>node.getBoundingClientRect().bottom<=innerHeight),'Formato vertical completo');
    const ratio=await page.locator('#canvas').evaluate(node=>{const rect=node.getBoundingClientRect();return rect.width/rect.height;});
    assert.ok(Math.abs(ratio-9/16)<.01,'Conserva proporción del formato vertical');
    await page.locator('#orientation').selectOption('landscape');await page.locator('#step-edit').click();
    await page.locator('.sceneItem').last().click();
    assert.ok(await page.locator('#sceneList').evaluate(list=>{const item=list.querySelector('.selected').getBoundingClientRect(),bounds=list.getBoundingClientRect();return item.left>=bounds.left-1&&item.right<=bounds.right+1;}),'Escena activa visible en la tira');
    await page.locator('[data-inspector=appearance]').click();
    await page.evaluate(()=>{window.scrollTo(0,0);const node=document.querySelector('.workflow-inspector-content');node.scrollTop=node.scrollHeight;});
    const pane=await page.locator('.workflow-inspector-content').boundingBox();await page.mouse.move(pane.x+pane.width/2,pane.y+pane.height/2);await page.mouse.wheel(0,450);
    await page.waitForFunction(()=>scrollY>100);
    // Cambiar de etapa desde un control bajo vuelve a presentar el principio del flujo.
    await page.evaluate(()=>workflow.setStage('create'));
    await page.waitForFunction(()=>document.querySelector('.animotion-shell').getBoundingClientRect().top>=document.querySelector('.topbar').getBoundingClientRect().bottom);
    await page.locator('.workflow-options summary').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('.workflow-options').evaluate(node=>node.open),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: diez tamaños, tres etapas, encabezado sin solapes, código sin doble scroll, capas con scroll único, inspector sin atrapar rueda, ventanas bajas y retorno al inicio.');
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
