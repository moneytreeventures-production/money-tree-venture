import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = new URL(process.env.E2E_BASE_URL || 'http://localhost:3000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password || base.pathname !== '/') throw new Error('E2E requires a localhost origin.');
const browser = [process.env.CHROME_PATH, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'), 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync);

test('actual local application: isolated anonymous public journey', { timeout: 180000 }, async t => {
  assert.ok(browser, 'BLOCKED: set CHROME_PATH to an installed Chromium executable');
  try { await fetch(new URL('/favicon.ico', base), { signal: AbortSignal.timeout(10000) }); }
  catch { t.skip('BLOCKED: local server unreachable; start npm.cmd run dev in another terminal'); return; }
  const profile = await mkdtemp(path.join(tmpdir(), 'mtv-e2e-'));
  const child = spawn(browser, ['--headless', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('BLOCKED: browser startup timeout')), 10000);
      child.once('error', () => { clearTimeout(timer); reject(new Error('BLOCKED: browser launch failed')); });
      child.stderr.on('data', chunk => { const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
    });
    const port = new URL(endpoint).port;
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(x => x.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    const mediaResponses = new Map();
    const mediaRequests = new Map();
    const mediaFailures = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Network.requestWillBeSent' && message.params?.type === 'Image') {
        try { const url = new URL(message.params.request.url); mediaRequests.set(message.params.requestId, url.origin + url.pathname); } catch {}
      }
      if (message.method === 'Network.responseReceived' && message.params?.type === 'Image') {
        try { const url = new URL(message.params.response.url); mediaResponses.set(url.origin + url.pathname, message.params.response.status); } catch {}
      }
      if (message.method === 'Network.loadingFailed') {
        const path = mediaRequests.get(message.params.requestId);
        if (path) mediaFailures.set(path, /^net::ERR_[A-Z_]+$/.test(message.params.errorText) ? message.params.errorText : 'resource load failed');
      }
      const item = pending.get(message.id);
      if (item) { clearTimeout(item.timer); pending.delete(message.id); if (message.error) item.reject(new Error('Browser command failed')); else item.resolve(message.result); }
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error('BLOCKED: browser command timeout: ' + method)); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error('Browser evaluation failed (details omitted)'); return result.result.value; };
    const waitFor = expression => evaluate(`new Promise(resolve=>{const end=Date.now()+10000;const check=()=>{if(${expression})resolve(true);else if(Date.now()>end)resolve(false);else requestAnimationFrame(check)};check()})`);
    const navigate = async route => { await command('Page.navigate', { url: new URL(route, base).href }); assert.equal(await waitFor("document.readyState==='complete' && !!document.querySelector('main')"), true); };
    const scenario = async (name, run) => t.test(name, async context => { try { await run(context); } catch (error) { await mkdir('.e2e-artifacts', { recursive: true }); const shot = await command('Page.captureScreenshot').catch(() => null); if (shot) await writeFile(path.join('.e2e-artifacts', `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), Buffer.from(shot.data, 'base64')); throw error; } });
    await command('Page.enable');
    await command('Network.enable');
    for (const route of ['/', '/products', '/cart', '/checkout']) {
      await t.test(`renders ${route}`, async () => {
        try {
          await command('Page.navigate', { url: new URL(route, base).href });
          const result = await evaluate(`new Promise(resolve => { const end=Date.now()+10000; const check=()=>{if(document.readyState==='complete' && document.querySelector('main')) resolve({main:true,overflow:document.documentElement.scrollWidth>innerWidth}); else if(Date.now()>end) resolve({main:false}); else requestAnimationFrame(check)};check()})`);
          assert.equal(result.main, true, 'FAIL: main content did not render');
          assert.equal(result.overflow, false, 'FAIL: horizontal overflow at default browser viewport');
        } catch (error) {
          await mkdir('.e2e-artifacts', { recursive: true });
          const shot = await command('Page.captureScreenshot').catch(() => null);
          if (shot) await writeFile(path.join('.e2e-artifacts', `${route.replaceAll('/', '_') || 'home'}.png`), Buffer.from(shot.data, 'base64'));
          throw error;
        }
      });
    }
    let published = [];
    await t.test('catalogue API returns real published data', async () => {
      const result = await evaluate(`fetch('/api/products',{signal:AbortSignal.timeout(10000)}).then(async r=>{const b=await r.json();return {status:r.status,success:b.success,items:b.data?.items ?? []}}).catch(()=>({blocked:true}))`);
      assert.equal(result.blocked, undefined, 'BLOCKED: database/network availability');
      assert.equal(result.status, 200, 'BLOCKED: catalogue API unavailable');
      assert.equal(result.success, true);
      assert.ok(result.items.length > 0, 'BLOCKED: no published development fixtures');
      published = result.items;
    });
    const product = published.find(item => ['pdf', 'pdf_bundle'].includes(item.productType));
    await scenario('catalogue search and product detail', async context => {
      if (!product) return context.skip('BLOCKED: no eligible published PDF');
      await navigate('/');
      assert.equal(await waitFor(`!!document.querySelector('main a[href^="/products/"]')`), true, 'Homepage product card missing');
      await evaluate(`document.querySelector('a[href="/products"]').click()`);
      assert.equal(await waitFor(`location.pathname==='/products'`), true, 'Catalogue navigation failed');
      await navigate('/products');
      assert.equal(await waitFor(`!!document.querySelector('a[aria-label=${JSON.stringify(`View ${product.name} details`)}]')`), true);
      assert.equal(await evaluate(`!!document.querySelector('label[for="catalogue-search"]')`), true);
      await evaluate(`document.querySelector('#catalogue-search').focus()`);
      await command('Input.insertText', { text: product.name });
      await evaluate(`document.querySelector('form[role="search"] button[type="submit"]').click()`);
      assert.equal(await waitFor(`location.search.includes('q=')`), true, 'Search did not update the URL');
      await navigate(`/products/${encodeURIComponent(product.slug)}`);
      assert.equal(await waitFor(`document.querySelector('h1')?.textContent===${JSON.stringify(product.name)}`), true);
      const button = await evaluate(`(()=>{const b=document.querySelector('button[aria-label^="Add to cart:"]');return {present:!!b,label:b?.getAttribute('aria-label')}})()`);
      assert.equal(button.present, true, 'Product has no accessible add-to-cart button');
      assert.ok(button.label.includes(product.name));
      const media = await evaluate(`(()=>{const main=document.querySelector('main');const image=Array.from(main.querySelectorAll('img')).find(i=>i.alt===${JSON.stringify(`${product.name} product thumbnail`)});const video=main.querySelector('video');const url=image?.currentSrc||image?.src||video?.poster||'';return {kind:image?'image':video?.poster?'video-poster':video?'video-without-poster':'fallback',url,complete:image?.complete??false,width:image?.naturalWidth??0,height:image?.naturalHeight??0}})()`);
      if (media.kind === 'fallback' || media.kind === 'video-without-poster') {
        assert.equal(product.imageRefs?.length ?? 0, 0, 'Expected product thumbnail is absent; detail rendered a fallback');
        context.diagnostic('SKIP: product has no image asset; detail uses the preview fallback');
      } else {
        const source = new URL(media.url);
        const safePath = source.origin + source.pathname;
        const diagnosticPath = /^\/(?:products|_next|images)\//.test(source.pathname) ? safePath : source.origin + '/[path-redacted]';
        const loaded = await evaluate(`new Promise(resolve=>{const main=document.querySelector('main');const i=Array.from(main.querySelectorAll('img')).find(x=>x.alt===${JSON.stringify(`${product.name} product thumbnail`)});if(i)i.scrollIntoView({block:'center'});const probe=i||new Image();if(!i)probe.src=${JSON.stringify(media.url)};const end=Date.now()+10000;const check=()=>{if(probe.complete)resolve({ok:probe.naturalWidth>0,width:probe.naturalWidth,height:probe.naturalHeight,complete:true});else if(Date.now()>end)resolve({ok:false,width:probe.naturalWidth,height:probe.naturalHeight,complete:false});else requestAnimationFrame(check)};check()})`);
        if (!loaded.ok) context.diagnostic(`Image diagnostic: kind=${media.kind}, source=${diagnosticPath}, complete=${loaded.complete}, dimensions=${loaded.width}x${loaded.height}, HTTP=${mediaResponses.get(safePath) ?? 'not observed'}, loadError=${mediaFailures.get(safePath) ?? 'none observed'}`);
        assert.equal(loaded.ok, true, 'Expected public product image/poster could not be loaded');
      }
    });
    await scenario('category filter for an active product category', async context => {
      if (!product?.categoryIds?.length) return context.skip('BLOCKED: selected product has no category');
      const categories = await evaluate(`fetch('/api/categories?page=1&pageSize=100',{signal:AbortSignal.timeout(10000)}).then(r=>r.json()).then(x=>x.data?.items??[]).catch(()=>[])`);
      const category = categories.find(item => product.categoryIds.includes(item._id));
      if (!category) return context.skip('BLOCKED: product category is not active or absent from public categories');
      await navigate('/products');
      assert.equal(await waitFor(`Array.from(document.querySelector('select[aria-label="Filter by category"]')?.options??[]).some(o=>o.value===${JSON.stringify(category.slug)})`), true);
      await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Filter by category"]');s.value=${JSON.stringify(category.slug)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
      assert.equal(await waitFor(`new URLSearchParams(location.search).get('category')===${JSON.stringify(category.slug)}`), true, 'Category filter did not update the URL');
    });
    await scenario('cart add, persistence, coupon feedback and removal', async context => {
      if (!product) return context.skip('BLOCKED: no eligible published PDF');
      await navigate(`/products/${encodeURIComponent(product.slug)}`);
      if (!await waitFor(`(()=>{const b=document.querySelector('button[aria-label^="Add to cart:"]');return b&&!b.disabled})()`)) return context.skip('BLOCKED: eligible Add to cart action unavailable');
      await evaluate(`document.querySelector('button[aria-label^="Add to cart:"]').click()`);
      await navigate('/cart');
      assert.equal(await waitFor(`Array.from(document.querySelectorAll('h2')).some(x=>x.textContent===${JSON.stringify(product.name)})`), true, 'Added product did not appear');
      assert.equal(await evaluate(`document.querySelector('button[aria-label^="Increase quantity"]')?.disabled`), true, 'Quantity must remain one');
      const subtotal = await evaluate(`document.querySelector('main')?.innerText.includes('Subtotal') && document.querySelector('main')?.innerText.includes('₹')`);
      assert.equal(subtotal, true, 'INR subtotal missing');
      await navigate('/cart');
      assert.equal(await waitFor(`Array.from(document.querySelectorAll('h2')).some(x=>x.textContent===${JSON.stringify(product.name)})`), true, 'Cart did not persist after reload');
      assert.equal(await evaluate(`!!document.querySelector('label[for="cart-coupon"]')`), true);
      await evaluate(`document.querySelector('#cart-coupon').focus()`);
      await command('Input.insertText', { text: 'INVALID-E2E-COUPON' });
      await evaluate(`document.querySelector('#cart-coupon').closest('form').querySelector('button').click()`);
      assert.equal(await waitFor(`document.querySelector('form:has(#cart-coupon) [role="status"]')?.textContent?.length>8`), true, 'Coupon feedback missing');
      await navigate('/checkout');
      assert.equal(await waitFor(`document.querySelector('main')?.innerText.includes('Google sign in is required')`), true);
      assert.equal(await evaluate(`!!document.querySelector('a[href="/login?next=%2Fcheckout"]')`), true);
      await navigate('/cart');
      assert.equal(await waitFor(`Array.from(document.querySelectorAll('h2')).some(x=>x.textContent===${JSON.stringify(product.name)})`), true);
      await evaluate(`document.querySelector('button[aria-label^="Remove "][aria-label$=" from cart"]').click()`);
      assert.equal(await waitFor(`document.querySelector('main')?.innerText.includes('Your cart is empty.')`), true);
    });
    await scenario('empty checkout remains safe after cart removal', async () => {
      await navigate('/checkout');
      assert.equal(await waitFor(`document.querySelector('main')?.innerText.includes('There are no resources in your cart.')`), true);
    });
  } finally {
    socket?.close();
    child.kill();
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else { child.once('exit', resolve); setTimeout(resolve, 3000).unref(); } });
    await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
});
