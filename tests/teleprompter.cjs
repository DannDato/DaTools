// Node + Playwright (PLAYWRIGHT_MODULE y BROWSER_CHANNEL opcionales).
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
  try{let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    file=file===root?path.join(root,'index.html'):path.extname(file)?file:file+'.html';
    const data=await fs.readFile(file),ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[ext]||'application/octet-stream');res.end(data);
  }catch(_){res.writeHead(404);res.end();}
});
(async()=>{
  let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const url=`http://127.0.0.1:${server.address().port}/teleprompter/teleprompter.html`;
    await page.goto(url);assert.ok(await page.locator('#play').isDisabled());
    const script=Array.from({length:12},(_,i)=>`Párrafo ${i+1}. Este es mi guion personal para probar el teleprompter. La lectura avanza con calma y mantiene el lugar mientras ajusto el tamaño del texto.`).join('\n\n');
    await page.locator('#script').fill(script);await page.selectOption('#countdown','0');
    await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Guardado');
    assert.equal(await page.locator('#readerText').textContent(),script);
    await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#seek').value)>2);
    assert.ok(await page.locator('#viewport').evaluate(node=>node.scrollTop>0));
    await page.locator('#play').click();assert.equal(await page.locator('#playStatus').textContent(),'En pausa');
    await page.locator('#seek').fill('400');
    const oldRatio=await page.locator('#viewport').evaluate(node=>node.scrollTop/(node.scrollHeight-node.clientHeight));assert.ok(Math.abs(oldRatio-.4)<.01);
    await page.locator('#fontSize').fill('72');
    const newRatio=await page.locator('#viewport').evaluate(node=>node.scrollTop/(node.scrollHeight-node.clientHeight));assert.ok(Math.abs(newRatio-.4)<.01);
    await page.locator('#mirror').check();assert.match(await page.locator('#readerText').evaluate(node=>getComputedStyle(node).transform),/-1/);
    await page.locator('#guide').uncheck();assert.ok(await page.locator('#guideBand').isHidden());
    await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Guardado');await page.reload();
    assert.equal(await page.locator('#script').inputValue(),script);assert.ok(await page.locator('#mirror').isChecked());assert.equal(await page.locator('#fontSize').inputValue(),'72');assert.ok(Math.abs(Number(await page.locator('#seek').inputValue())-400)<3);
    await page.locator('#viewport').focus();await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#speed').inputValue(),'145');
    await page.keyboard.press('r');assert.equal(await page.locator('#seek').inputValue(),'0');
    await page.keyboard.press('Space');assert.equal(await page.locator('#playStatus').textContent(),'Leyendo');await page.keyboard.press('Space');
    // Escribir en el editor no activa atajos.
    await page.locator('#script').focus();await page.keyboard.press('r');assert.notEqual(await page.locator('#playStatus').textContent(),'Leyendo');
    // Cuenta atrás cancelable y reproducción de un guion de una sola línea.
    await page.locator('#script').fill('Hola');await page.selectOption('#countdown','3');await page.locator('#play').click();assert.ok(await page.locator('#countdownOverlay').isVisible());
    await page.locator('#play').click();assert.ok(await page.locator('#countdownOverlay').isHidden());
    await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#playStatus').textContent==='Leyendo');
    await page.locator('#play').click();
    await page.selectOption('#countdown','0');await page.locator('#speed').fill('300');await page.locator('#play').click();
    await page.waitForFunction(()=>document.querySelector('#playStatus').textContent==='Guion terminado');assert.equal(await page.locator('#seek').inputValue(),'1000');
    // Importación SRT, sin números de segmento ni timestamps.
    await page.locator('#scriptFile').setInputFiles({name:'Toma.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:00,000 --> 00:00:02,000\nHola <b>mundo</b>.\n\n2\n00:00:02,000 --> 00:00:04,000\nSeguimos grabando.')});
    await page.waitForFunction(()=>document.querySelector('#script').value==='Hola mundo.\n\nSeguimos grabando.');
    const downloaded=page.waitForEvent('download');await page.locator('#downloadScript').click();const download=await downloaded;
    assert.equal(download.suggestedFilename(),'Toma.txt');assert.equal(await fs.readFile(await download.path(),'utf8'),'Hola mundo.\n\nSeguimos grabando.');
    await page.locator('#script').fill(script);await page.locator('#mirror').uncheck();await page.locator('#guide').check();await page.locator('#fontSize').fill('48');
    await page.locator('#readingMode').click();assert.ok(await page.locator('.tp-sidebar').isHidden());
    await page.locator('#fullscreen').click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));await page.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
    await page.locator('#readingMode').click();assert.ok(await page.locator('.tp-sidebar').isVisible());
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'teleprompter-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#readingMode').click();assert.ok(await page.locator('#viewport').evaluate(node=>node.clientHeight>200));
    if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'teleprompter-mobile.png'),fullPage:true});
    // El guion sigue usable si el almacenamiento está bloqueado.
    const privatePage=await browser.newPage();await privatePage.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('blocked');};});await privatePage.goto(url);
    await privatePage.locator('#script').fill('Este texto no depende del almacenamiento.');await privatePage.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='Sin guardado automático');assert.ok(await privatePage.locator('#downloadScript').isEnabled());await privatePage.close();
    // Texto con HTML se muestra literalmente, sin ejecutarlo.
    await page.locator('#readingMode').click();await page.locator('#script').fill('<img src=x onerror="window.injected=true">');assert.equal(await page.locator('#readerText img').count(),0);
    const home=await browser.newPage();await home.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${server.address().port}/`)?route.continue():route.abort());
    await home.goto(`http://127.0.0.1:${server.address().port}/index.html`);await home.locator('.tool.teleprompter').click();assert.ok(home.url().endsWith('/teleprompter/teleprompter'));await home.close();
    assert.deepEqual(errors,[]);console.log('PASS: lectura/pausa, posición, autosave/recarga, tamaño, espejo, guía, atajos, cuenta atrás, fin, SRT/TXT, fullscreen, móvil, almacenamiento bloqueado y texto seguro.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
