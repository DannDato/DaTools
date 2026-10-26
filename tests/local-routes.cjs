const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  try{
    const page=await browser.newPage();
    // Servidor estático básico simulado: NO resuelve rutas sin extensión.
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(!['localhost','192.168.1.20','tools.dannprod.com'].includes(url.hostname))return route.abort();
      try{
        let filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));
        if(url.pathname.endsWith('/'))filename=path.join(filename,'index.html');
        if(!filename.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
        const body=await fs.readFile(filename);
        await route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(filename)]||'application/octet-stream'});
      }catch{await route.fulfill({status:404,body:'Not found'});}
    });
    const tools=['submotion','animotion','toviu','imanage','teleprompter'];
    for(const hostname of ['localhost','192.168.1.20']){
      for(const tool of tools){
        await page.goto(`http://${hostname}/index.html`);
        const link=page.locator(`.tool.${tool}`);
        assert.equal(new URL(await link.getAttribute('href'),page.url()).pathname,`/${tool}/${tool}.html`);
        const response=await Promise.all([page.waitForNavigation(),link.click()]);assert.equal(response[0].status(),200);
        await page.reload();assert.ok(await page.locator('body').isVisible());
        if(tool==='toviu'){await page.goBack();continue;}
        const home=page.locator('a[href]').filter({hasText:'DaTools'}).first();
        await home.click();assert.equal(new URL(page.url()).pathname,'/');
      }
    }
    await page.goto('http://tools.dannprod.com/index.html');
    assert.equal(await page.locator('.tool.animotion').getAttribute('href'),'animotion/animotion');
    assert.equal(await page.locator('.tool.trazio').getAttribute('href'),'https://trazio.stream/app');
    // Respeta parámetros, fragmentos y despliegues dentro de una subcarpeta.
    const script=await fs.readFile(path.join(root,'js/local-routes.js'),'utf8');
    await page.goto('http://localhost/index.html');
    await page.evaluate(()=>{history.replaceState(null,'','/tools/index.html');document.body.innerHTML='<a href="imanage/imanage?tab=audio#opciones">Filer</a><a href="#inicio">Inicio</a>';});
    await page.addScriptTag({content:script});
    assert.equal(await page.locator('a').first().getAttribute('href'),'http://localhost/tools/imanage/imanage.html?tab=audio#opciones');
    assert.equal(await page.locator('a').last().getAttribute('href'),'#inicio');
    const filePage=await browser.newPage();
    await filePage.route(/^https?:/,route=>route.abort());
    await filePage.goto(pathToFileURL(path.join(root,'index.html')).href);
    await filePage.locator('.tool.animotion').click();assert.ok(filePage.url().endsWith('/animotion/animotion.html'));
    await filePage.locator('header .brand').click();assert.ok(filePage.url().endsWith('/index.html'));
    console.log('PASS: cinco herramientas, localhost y LAN sin rewrite, recarga, vuelta al inicio, producción, enlaces externos, parámetros, subcarpetas y file://.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
