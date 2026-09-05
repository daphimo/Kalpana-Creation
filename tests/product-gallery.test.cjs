const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function fixture(count = 3, selected = '1', backendCount = count) {
  const dimensions = [[800, 1800], [1200, 700], [1000, 1000]];
  const cards = Array.from({ length: count }, (_, index) => {
    const id = (Number(selected) - 1 + index) % count + 1;
    const [width, height] = dimensions[(id - 1) % 3];
    return `<li class="responsive-product-gallery__card" data-gallery-card data-media-id="${id}" data-media-type="image"><a href="/image-${id}.svg?zoom=1" class="responsive-product-gallery__image-button" data-gallery-open aria-haspopup="dialog" aria-label="View image ${id}"><img src="/image-${id}.svg" width="${width}" height="${height}" alt="Product image ${id}"></a></li>`;
  }).join('');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="importmap">{"imports":{"@shopify/events":"/events.js"}}</script><link rel="stylesheet" href="/assets/base.css"><link rel="stylesheet" href="/assets/custom.css"><link rel="stylesheet" href="/assets/responsive-product-gallery.css"><link rel="stylesheet" href="/assets/desktop-product-gallery.css" media="(min-width:750px)"><link rel="stylesheet" href="/assets/mobile-product-gallery.css" media="(max-width:749px)"><style>html{scroll-behavior:smooth}body{margin:0;--color-foreground:#222;--color-foreground-rgb:34 34 34}main{max-width:760px;margin:auto}header{height:200px}footer{height:1800px}</style><script type="module" src="/assets/responsive-product-gallery.js"></script></head><body><div class="page-wrapper"><header>Product page</header><main class="shopify-section"><button id="variant">Change variant</button><responsive-product-gallery class="responsive-product-gallery" data-block-id="gallery" data-product-media-count="${backendCount}" data-selected-media="${selected}" data-desktop-module="/assets/desktop-product-gallery.js" data-mobile-module="/assets/mobile-product-gallery.js" style="--gallery-gap:12px;--gallery-ratio:.8"><div class="desktop-product-gallery" data-desktop-host></div><div class="mobile-product-gallery" data-mobile-host></div><ul class="responsive-product-gallery__source" data-gallery-list>${cards || '<li class="responsive-product-gallery__card">No media</li>'}</ul></responsive-product-gallery></main><footer></footer></div></body></html>`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); return response.end(fixture(Number(url.searchParams.get('count') ?? 3), url.searchParams.get('selected') || '1', Number(url.searchParams.get('backend') ?? url.searchParams.get('count') ?? 3))); }
  if (url.pathname === '/events.js') { response.setHeader('Content-Type', 'text/javascript'); return response.end("export const StandardEvents = {productSelect:'product:select'};"); }
  if (/^\/image-\d+\.svg$/.test(url.pathname)) {
    const id = Number(url.pathname.match(/\d+/)[0]);
    const [width, height] = [[800,1800],[1200,700],[1000,1000]][(id - 1) % 3];
    response.setHeader('Content-Type','image/svg+xml');
    return response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#e0c9b6"/><stop offset="1" stop-color="#7b3749"/></linearGradient></defs><path fill="url(#g)" d="M0 0h${width}v${height}H0z"/><text x="50" y="120" font-size="64">Image ${id} top</text><text x="50" y="${height-80}" font-size="64">Image ${id} bottom</text></svg>`);
  }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.statusCode = 404; return response.end(); }
  response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/css');
  response.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const browser = await chromium.launch({ executablePath: process.env.GALLERY_BROWSER || (fs.existsSync(edgePath) ? edgePath : undefined), headless: true });
  fs.mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
  const errors = [];
  const desktop = await browser.newPage({ viewport: {width:1440,height:1000} });
  desktop.on('pageerror', error => errors.push(error.message));
  const requests = [];
  desktop.on('request', request => requests.push(request.url()));
  try {
    await desktop.goto(base);
    await desktop.waitForSelector('.desktop-product-gallery__grid');
    assert.equal(requests.some(url => url.endsWith('/mobile-product-gallery.js')), false);
    assert.equal(await desktop.locator('.mobile-product-gallery [data-gallery-card]').count(), 0);
    assert.equal(await desktop.locator('.desktop-product-gallery__grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2);
    await desktop.evaluate(() => { document.body.style.setProperty('overflow','auto','important'); document.querySelector('.page-wrapper').scrollTo({top:180,behavior:'instant'}); });
    const before = await desktop.evaluate(() => ({top:scrollY,wrapperTop:document.querySelector('.page-wrapper').scrollTop,style:document.body.getAttribute('style')}));
    await desktop.locator('[data-gallery-open]').first().click();
    await desktop.waitForSelector('.desktop-product-viewer[open]');
    const image = desktop.locator('.desktop-product-viewer [data-image]');
    await desktop.screenshot({path:path.join(__dirname,'artifacts/desktop-viewer.png')});
    const width = (await image.boundingBox()).width;
    const stage = await desktop.locator('[data-stage]').boundingBox();
    assert.deepEqual(stage, {x:0,y:0,width:1440,height:1000});
    assert.deepEqual(await desktop.locator('dialog').boundingBox(), stage);
    assert.equal(width, 980);
    assert.equal((await image.boundingBox()).x, (stage.width - width) / 2);
    assert.ok(Math.abs((await image.boundingBox()).height / width - 1800 / 800) < .001);

    await desktop.mouse.move(stage.x + stage.width/2, stage.y + stage.height - 5);
    await desktop.waitForTimeout(650);
    assert.equal((await image.boundingBox()).width, width);
    assert.ok((await image.boundingBox()).y < stage.y - 100);
    assert.equal(await desktop.locator('[data-stage]').getAttribute('data-direction'), 'down');
    assert.equal(await desktop.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
    assert.equal(await desktop.locator('.page-wrapper').evaluate(el => getComputedStyle(el).overflow), 'hidden');
    assert.equal(await desktop.locator('dialog').evaluate(el => el.scrollHeight > el.clientHeight), false);
    // Every overlay must stop an in-flight pan immediately and keep the normal cursor.
    for (const selector of ['[data-thumbnail]', '[data-close]', '[data-previous]', '[data-next]', '[data-status]']) {
      await desktop.mouse.move(stage.width / 2, 100);
      await desktop.waitForTimeout(30);
      const control = desktop.locator(selector);
      const box = await control.boundingBox();
      await desktop.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const stopped = await image.getAttribute('style');
      assert.equal(await desktop.locator('[data-stage]').getAttribute('data-direction'), null);
      assert.equal((await control.evaluate(el => getComputedStyle(el).cursor)).includes('gallery-cursor'), false);
      await desktop.mouse.wheel(0, 180);
      await desktop.waitForTimeout(100);
      assert.equal(await image.getAttribute('style'), stopped, `Pan continued over ${selector}`);
      await desktop.mouse.move(stage.width / 2, 900);
      await desktop.waitForTimeout(30);
      assert.notEqual(await image.getAttribute('style'), stopped);
    }
    await desktop.mouse.move(stage.width / 2, 450);
    assert.equal(await desktop.locator('[data-stage]').getAttribute('data-direction'), 'up');
    await desktop.mouse.move(stage.width / 2, 510);
    assert.equal(await desktop.locator('[data-stage]').getAttribute('data-direction'), 'up');
    await desktop.mouse.move(stage.width / 2, 560);
    assert.equal(await desktop.locator('[data-stage]').getAttribute('data-direction'), 'down');
    await desktop.keyboard.press('ArrowRight');
    await desktop.waitForFunction(() => document.querySelector('dialog [data-image]').alt === 'Product image 2');
    await desktop.mouse.move(700, 2); // Landscape image leaves natural aspect-ratio space.
    const landscape = await image.getAttribute('style');
    await desktop.mouse.wheel(0, 200);
    await desktop.waitForTimeout(100);
    assert.equal(await image.getAttribute('style'), landscape);
    assert.equal(await desktop.locator('[data-stage]').getAttribute('data-direction'), null);
    assert.equal(await desktop.locator('dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);

    await desktop.keyboard.press('ArrowLeft');
    await desktop.locator('[data-next]').evaluate(button => { for(let i=0;i<8;i++) button.click(); });
    await desktop.waitForTimeout(100);
    assert.equal(await image.getAttribute('alt'), 'Product image 3');
    await desktop.keyboard.press('Escape');
    assert.equal(await desktop.locator('dialog').count(), 0);
    assert.deepEqual(await desktop.evaluate(() => ({top:scrollY,wrapperTop:document.querySelector('.page-wrapper').scrollTop,style:document.body.getAttribute('style')})), before);
    assert.equal(await desktop.locator('[data-gallery-open]').first().evaluate(el => el === document.activeElement), true);
    // Close/reopen in the same task must not let a queued close event tear down the new viewer.
    await desktop.evaluate(() => { const link=document.querySelector('[data-gallery-open]'); link.click(); document.querySelector('[data-close]').click(); link.click(); });
    await desktop.waitForTimeout(100);
    assert.equal(await desktop.locator('dialog[open]').count(), 1);
    await desktop.setViewportSize({width:390,height:844});
    await desktop.waitForSelector('.mobile-product-gallery__track');
    assert.equal(await desktop.locator('dialog').count(), 0);
    assert.equal(await desktop.evaluate(() => document.body.style.overflow), 'auto');
    await desktop.setViewportSize({width:1440,height:1000});
    await desktop.waitForSelector('.desktop-product-gallery__grid');
    // Same event promise/HTML shape used by the theme's variant picker.
    await desktop.evaluate(async () => {
      const html = new DOMParser().parseFromString(await (await fetch('/?selected=2')).text(),'text/html');
      const event = new Event('product:select',{bubbles:true});
      event.promise = Promise.resolve({detail:{html}});
      document.querySelector('#variant').dispatchEvent(event);
    });
    await desktop.waitForFunction(() => document.querySelector('.desktop-product-gallery__grid [data-gallery-card]')?.dataset.mediaId === '2');
    await desktop.locator('[data-gallery-open]').first().click();
    await desktop.evaluate(() => document.querySelector('responsive-product-gallery').remove());
    assert.equal(await desktop.locator('dialog').count(),0);
    assert.equal(await desktop.evaluate(() => document.body.style.overflow),'auto');
    await desktop.goto(base+'/?count=1&backend=3');
    await desktop.waitForSelector('.desktop-product-gallery__grid');
    assert.equal(await desktop.locator('.desktop-product-gallery__grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2);
    await desktop.goto(base+'/?count=1');
    await desktop.waitForSelector('.desktop-product-gallery__grid');
    assert.equal(await desktop.locator('.desktop-product-gallery__grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
    const singleCard = await desktop.locator('[data-gallery-card]').boundingBox();
    assert.equal(singleCard.width, (await desktop.locator('[data-gallery-list]').boundingBox()).width);
    await desktop.route('**/image-1.svg?zoom=1', route => route.abort());
    await desktop.locator('[data-gallery-open]').click();
    await desktop.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Showing preview'));
    assert.equal(await desktop.locator('[data-previous]').isVisible(), false);
    assert.equal(await desktop.locator('[data-next]').isVisible(), false);
    assert.equal(await desktop.locator('[data-image]').evaluate(el => el.complete && el.naturalWidth > 0), true);
    await desktop.keyboard.press('Tab');
    assert.equal(await desktop.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true);
    await desktop.keyboard.press('Escape');
    await desktop.unroute('**/image-1.svg?zoom=1');
    console.log('PASS desktop: backend media count, edge-to-edge viewport, overlay hit areas, immediate pan cancellation, midpoint stability, background wheel exclusion, 2 columns, isolated import, panning, constant width, arrows, rapid selection, Escape, focus, exact scroll/style restoration, rapid reopen, responsive switch, variant replacement and section removal.');

    const mobile = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    mobile.on('pageerror',error => errors.push(error.message));
    const mobileRequests=[];
    mobile.on('request',request => mobileRequests.push(request.url()));
    await mobile.goto(base);
    await mobile.waitForSelector('.mobile-product-gallery__track');
    assert.equal(mobileRequests.some(url => url.endsWith('/desktop-product-gallery.js')),false);
    assert.equal(await mobile.locator('.desktop-product-gallery [data-gallery-card]').count(),0);
    await mobile.locator('.mobile-product-gallery__pagination button').nth(1).tap();
    await mobile.waitForTimeout(500);
    assert.equal(await mobile.locator('.mobile-product-gallery__pagination button').nth(1).getAttribute('aria-current'),'true');
    const client = await mobile.context().newCDPSession(mobile);
    const track = await mobile.locator('[data-gallery-list]').boundingBox();
    const touch = async (type, points) => client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=0])=>({x,y,id}))});
    const ty = Math.min(track.y+100,700);
    await touch('touchStart',[[320,ty]]);
    for (let x=280;x>=60;x-=40) { await touch('touchMove',[[x,ty]]); await mobile.waitForTimeout(20); }
    await touch('touchEnd',[]);
    await mobile.waitForTimeout(500);
    assert.equal(await mobile.locator('.mobile-product-gallery__pagination button').nth(2).getAttribute('aria-current'),'true');
    assert.equal(await mobile.locator('dialog').count(),0);
    await mobile.locator('[data-gallery-open]').nth(2).tap();
    await mobile.waitForSelector('.mobile-product-viewer[open]');
    assert.equal(await mobile.locator('dialog [data-thumbnail], dialog [data-previous], dialog [data-next]').count(),0);
    await mobile.screenshot({path:path.join(__dirname,'artifacts/mobile-viewer.png')});
    const mobileStage=await mobile.locator('dialog [data-stage]').boundingBox();
    const cx=mobileStage.x+mobileStage.width/2, cy=mobileStage.y+mobileStage.height/2;
    await touch('touchStart',[[cx-35,cy,0],[cx+35,cy,1]]);
    await touch('touchMove',[[cx-100,cy,0],[cx+100,cy,1]]);
    await touch('touchEnd',[]);
    await mobile.waitForTimeout(80);
    const zoomed=await mobile.locator('dialog [data-image]').getAttribute('style');
    assert.ok(/scale\(2\./.test(zoomed),zoomed);
    await touch('touchStart',[[cx,cy]]);
    await touch('touchMove',[[cx+60,cy+30]]);
    await touch('touchEnd',[]);
    await mobile.waitForTimeout(80);
    assert.notEqual(await mobile.locator('dialog [data-image]').getAttribute('style'),zoomed);
    assert.equal(await mobile.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');
    assert.equal(await mobile.locator('dialog').evaluate(el=>el.scrollHeight>el.clientHeight),false);
    await mobile.locator('[data-close]').tap();
    await mobile.waitForTimeout(400);
    assert.equal(await mobile.locator('dialog').count(),0);
    assert.equal(await mobile.locator('.mobile-product-gallery__pagination button').nth(2).getAttribute('aria-current'),'true');
    assert.equal(await mobile.evaluate(()=>document.body.style.overflow),'');
    await mobile.goto(base+'/?count=1');
    await mobile.waitForSelector('.mobile-product-gallery__track');
    assert.equal(await mobile.locator('.mobile-product-gallery__pagination').isVisible(),false);
    await mobile.locator('[data-gallery-open]').tap();
    const singleStage = await mobile.locator('dialog [data-stage]').boundingBox();
    const tapX = singleStage.x + singleStage.width / 2, tapY = singleStage.y + singleStage.height / 2;
    await touch('touchStart', [[tapX,tapY]]); await touch('touchEnd', []);
    await mobile.waitForTimeout(80);
    await touch('touchStart', [[tapX,tapY]]); await touch('touchEnd', []);
    assert.ok((await mobile.locator('dialog [data-image]').getAttribute('style')).includes('scale(2.5)'));
    await mobile.setViewportSize({width:640,height:390});
    await mobile.waitForTimeout(100);
    assert.equal(await mobile.locator('dialog').evaluate(el=>el.scrollHeight>el.clientHeight),false);
    await mobile.locator('[data-close]').tap();
    await mobile.setViewportSize({width:390,height:844});
    await mobile.goto(base+'/?count=20');
    await mobile.waitForSelector('.mobile-product-gallery__track');
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await mobile.goto(base+'/?count=0');
    await mobile.waitForSelector('.mobile-product-gallery__track');
    assert.equal(await mobile.locator('dialog').count(),0);
    console.log('PASS mobile: isolated import, pagination, real touch swipe, fullscreen viewer, real two-finger pinch and pan, scroll lock, state restoration, one/many/zero images and no horizontal overflow.');
    assert.deepEqual(errors,[]);
    console.log('PASS: no browser JavaScript errors.');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
