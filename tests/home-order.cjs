const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try{let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    file=file===root?path.join(root,'index.html'):path.extname(file)?file:file+'.html';
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
  }catch(_){res.writeHead(404);res.end();}
});
const order=page=>page.locator('.tool-grid > .tool').evaluateAll(cards=>cards.map(card=>card.dataset.toolId));
const center=box=>({x:box.x+box.width/2,y:box.y+box.height/2});
async function drag(page,source,target){
  const from=center(await source.boundingBox()),to=center(await target.boundingBox());
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:20});await page.mouse.up();
}
(async()=>{
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const base=`http://127.0.0.1:${server.address().port}/`,url=base+'index.html';
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    await page.goto(url);const original=await order(page);
    await drag(page,page.locator('.tool.trazio .tool-icon'),page.locator('.tool.animotion'));
    const moved=await order(page);assert.notDeepEqual(moved,original);assert.ok(page.url().endsWith('/index.html'));
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('datools.home.card-order.v1'))),moved);
    await page.reload();assert.deepEqual(await order(page),moved);
    // Movimiento hacia atrás y entre filas desde el icono de una imagen.
    await drag(page,page.locator('.tool.teleprompter img'),page.locator('.tool-grid > .tool').first());
    assert.equal((await order(page))[0],'teleprompter');assert.ok(page.url().endsWith('/index.html'));
    await page.locator('.tool.teleprompter').focus();await page.keyboard.press('Alt+ArrowRight');assert.equal((await order(page))[1],'teleprompter');
    const beforeCancel=await order(page);const from=center(await page.locator('.tool.teleprompter').boundingBox()),to=center(await page.locator('.tool-grid > .tool').last().boundingBox());
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:15});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await order(page),beforeCancel);
    // Una herramienta nueva se añade al final del orden guardado, sin adelantar las demás.
    await page.evaluate(ids=>localStorage.setItem('datools.home.card-order.v1',JSON.stringify([...ids.filter(id=>id!=='teleprompter'),'missing','trazio'])),original);
    await page.reload();assert.equal((await order(page)).at(-1),'teleprompter');
    await page.locator('.tool.teleprompter').click();assert.ok(page.url().endsWith('/teleprompter/teleprompter.html'));
    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    mobile.on('pageerror',error=>errors.push(error.message));await mobile.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());await mobile.goto(url);
    const mobileOriginal=await order(mobile),cdp=await mobile.context().newCDPSession(mobile);
    const start=center(await mobile.locator('.tool-grid > .tool .tool-grip').first().boundingBox()),end=center(await mobile.locator('.tool-grid > .tool').nth(1).boundingBox());
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.notDeepEqual(await order(mobile),mobileOriginal);assert.ok(mobile.url().endsWith('/index.html'));
    const mobileSaved=await order(mobile);await mobile.reload();assert.deepEqual(await order(mobile),mobileSaved);
    assert.equal(await mobile.locator('.is-reordering,.is-drop-target').count(),0);
    const box=await mobile.locator('.tool-grid > .tool').first().boundingBox();
    const scrollStart={x:box.x+65,y:box.y+box.height-25};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[scrollStart]});
    for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:scrollStart.x,y:scrollStart.y-i*15}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await mobile.waitForFunction(()=>scrollY>0);assert.deepEqual(await order(mobile),mobileSaved);
    assert.deepEqual(errors,[]);console.log('PASS: drag ratón sobre enlaces/imágenes, orden guardado/recarga, teclado, cancelar, nuevas herramientas, clic normal y drag táctil real.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
