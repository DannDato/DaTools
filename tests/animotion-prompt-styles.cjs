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
    const prompt=()=>page.evaluate(()=>buildPrompt([{start:0,end:2,text:'Una idea para ilustrar.'}]));
    const variants=[];
    for(const value of ['clean','whiteboard','sketch','doodle','technical','geometric','cartoon','silhouette','isometric','cutout']){await page.locator('#drawingStyle').selectOption(value);variants.push(await prompt());}
    assert.equal(new Set(variants).size,10);
    await page.getByText('Trazo y acabado',{exact:true}).click();
    for(const value of ['solid','dashed','dotted','dashdot','sketch','double']){
      await page.locator('#promptLineStyle').selectOption(value);const text=await prompt();
      const sample=JSON.parse(text.match(/EJEMPLO DE ESTRUCTURA[^\n]*\n([\s\S]+?)\n\nCATÁLOGO/)[1]);
      const line=sample.scenes[0].objects[0].shapes[0];assert.equal(line.lineStyle,['sketch','double'].includes(value)?'solid':value);
      assert.equal(await page.evaluate(raw=>validate(raw).scenes[0].objects[0].shapes[0].lineStyle,sample),line.lineStyle);
      if(value==='double')assert.ok(text.includes('dos paths próximos'));
    }
    await page.locator('#drawingStyle').selectOption('isometric');await page.locator('#promptLineStyle').selectOption('dashed');await page.locator('#promptStrokeWeight').selectOption('bold');
    await page.locator('#promptLineCap').selectOption('square');await page.locator('#promptLineJoin').selectOption('bevel');await page.locator('#promptFillStyle').selectOption('mixed');await page.locator('#promptDetail').selectOption('detailed');
    await page.getByText('Recursos y narrativa visual',{exact:true}).click();await page.locator('#promptResources').selectOption('mixed');await page.locator('#promptRhythm').selectOption('sequential');await page.locator('#promptContinuity').selectOption('evolving');
    await page.locator('#promptNotes').fill('Máquinas de papel, sin personajes; resalta el flujo de datos.');
    const text=await prompt(),sample=JSON.parse(text.match(/EJEMPLO DE ESTRUCTURA[^\n]*\n([\s\S]+?)\n\nCATÁLOGO/)[1]);
    assert.equal(sample.scenes[0].objects[0].shapes[0].strokeWidth,.065);assert.equal(sample.scenes[0].objects[0].shapes[0].lineCap,'square');assert.equal(sample.scenes[0].objects[0].shapes[0].lineJoin,'bevel');assert.equal(sample.scenes[0].objects[0].shapes[0].fill,true);assert.equal(sample.scenes[0].objects[0].shapes[0].stroke,true);
    assert.ok(text.includes('Máquinas de papel'));assert.ok(text.includes('Explica paso a paso'));assert.ok(text.includes('No existen keyframes'));
    await page.reload();assert.equal(await page.locator('#drawingStyle').inputValue(),'isometric');assert.equal(await page.locator('#promptLineStyle').inputValue(),'dashed');assert.equal(await page.locator('#promptNotes').inputValue(),'Máquinas de papel, sin personajes; resalta el flujo de datos.');
    // Rasterización: un patrón debe producir huecos reales, no solo sobrevivir al JSON.
    const objects=['solid','dashed','dotted','dashdot'].map((lineStyle,i)=>({type:'vector',x:.5,y:.2+i*.15,size:600,color:'#ffffff',enter:'none',idle:'none',shapes:[{kind:'line',points:[{x:-1,y:0},{x:1,y:0}],strokeWidth:.035,lineStyle,lineCap:lineStyle==='dotted'?'round':'butt',lineJoin:'bevel'}]}));
    objects.push(...[true,false].map((stroke,i)=>({type:'vector',x:i?.8:.2,y:.85,size:200,color:'#ffffff',enter:'none',idle:'none',shapes:[{kind:'rect',width:1,height:1,fill:true,stroke,strokeWidth:.1}]})));
    objects.push({type:'vector',x:.5,y:.85,size:200,color:'#ffffff',opacity:.5,enter:'none',idle:'none',shapes:[{kind:'rect',width:1,height:1,fill:true,stroke:false}]});
    await page.locator('#jsonCode summary').click();await page.locator('#jsonText').fill(JSON.stringify({fps:30,resolution:[2560,1440],scenes:[{start:0,end:2,objects}]}));await page.locator('#applyJson').click();
    const pixels=await page.evaluate(()=>{
      canvasEditor.previewAt(.5);
      const counts=[0,1,2,3].map(i=>{const data=ctx.getImageData(990,Math.round(canvas.height*(.2+i*.15)),580,1).data;let lit=0;for(let j=0;j<data.length;j+=4)if(data[j]>128)lit++;return lit;});
      const color=(x,y)=>ctx.getImageData(Math.round(x),Math.round(y),1,1).data[0];
      return {counts,outlined:color(canvas.width*.2+53,canvas.height*.85),fillOnly:color(canvas.width*.8+53,canvas.height*.85),opacity:color(canvas.width*.5,canvas.height*.85)};
    });
    assert.ok(pixels.counts[0]>570);assert.ok(pixels.counts[1]>200&&pixels.counts[1]<500);assert.ok(pixels.counts[2]>60&&pixels.counts[2]<400);assert.notEqual(pixels.counts[3],pixels.counts[0]);
    assert.ok(pixels.outlined>128);assert.equal(pixels.fillOnly,0);assert.ok(Math.abs(pixels.opacity-128)<=1);
    const saving=page.waitForEvent('download');await page.locator('#saveProject').click();const saved=JSON.parse(await fs.readFile(await (await saving).path(),'utf8'));
    assert.equal(saved.editor.controls.promptNotes,'Máquinas de papel, sin personajes; resalta el flujo de datos.');assert.equal(saved.editor.controls.promptLineStyle,'dashed');
    await page.locator('#promptNotes').fill('Cambió');await page.locator('#drawingStyle').selectOption('clean');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#projectFileInput').setInputFiles({name:'estilos.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>document.querySelector('#projectFileInput').value==='');
    assert.equal(await page.locator('#promptNotes').inputValue(),'Máquinas de papel, sin personajes; resalta el flujo de datos.');assert.equal(await page.locator('#drawingStyle').inputValue(),'isometric');
    assert.equal(await page.evaluate(()=>project.scenes[0].objects[1].shapes[0].lineStyle),'dashed');
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
    console.log('PASS: diez estilos, seis trazos, grosor/extremos/uniones/relleno/detalle, recursos/ritmo/continuidad/notas en prompt, ejemplo JSON válido, patrones con huecos reales, relleno+contorno, opacidad, recarga/proyecto y móvil.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
