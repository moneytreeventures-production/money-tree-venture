import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { evaluateCdp } from './cdp-evaluate.mjs';

if (process.env.E2E_AUTHORIZED_TEST !== 'true') throw new Error('Set E2E_AUTHORIZED_TEST=true for an approved local test account.');
const mode = process.env.E2E_AUTH_MODE;
if (!['customer', 'admin'].includes(mode)) throw new Error('E2E_AUTH_MODE must be customer or admin.');
const base = new URL(process.env.E2E_BASE_URL || 'http://localhost:3000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.protocol !== 'http:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Authenticated E2E requires a plain localhost HTTP origin.');
const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
assert.ok(browser, 'Install Chrome/Edge or set CHROME_PATH to the interactive browser executable.');

const profile = await mkdtemp(path.join(tmpdir(), 'mtv-auth-e2e-'));
const child = spawn(browser, ['--no-first-run', '--disable-extensions', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, new URL('/login', base).href], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: false });
let socket;
const prompt = createInterface({ input: process.stdin, output: process.stdout });
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Browser startup timed out.')), 15000);
    child.once('error', () => { clearTimeout(timeout); reject(new Error('Browser launch failed.')); });
    child.stderr.on('data', chunk => { const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
  });
  const port = new URL(endpoint).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  const page = targets.find(item => item.type === 'page' && item.url.startsWith(base.origin));
  assert.ok(page, 'Local test browser page was not found.');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const browserIssues = { errors: 0, hydration: 0 };
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      browserIssues.errors++;
      const description = message.params.args?.map(arg => String(arg.value ?? arg.description ?? '')).join(' ') ?? '';
      if (/hydration failed|server rendered html didn't match/i.test(description)) browserIssues.hydration++;
    }
    if (message.method === 'Runtime.exceptionThrown') browserIssues.errors++;
    const item = pending.get(message.id);
    if (item) { clearTimeout(item.timeout); pending.delete(message.id); if (message.error) item.reject(new Error('Browser command failed.')); else item.resolve(message.result); }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => { const number = ++id; const timeout = setTimeout(() => { pending.delete(number); reject(new Error(`Browser command timed out: ${method}`)); }, 15000); pending.set(number, { resolve, reject, timeout }); socket.send(JSON.stringify({ id: number, method, params })); });
  let stage = 'browser-startup';
  const evaluate = (label, expression) => evaluateCdp(command, { label, expression, stage });
  const waitForLocalPage = async () => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try {
        const ready = await evaluate('page-readiness', `({ready:document.readyState==='complete',local:location.origin===${JSON.stringify(base.origin)}})`);
        if (ready?.ready && ready.local) return;
      } catch (error) {
        if (!error.contextLost) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Local page did not become ready. stage=${stage} contextLost=unknown elapsedMs=10000`);
  };
  await command('Page.enable');
  await command('Runtime.enable');
  stage = 'anonymous-login-page';
  await command('Page.navigate', { url: new URL('/login', base).href });
  await waitForLocalPage();
  const anonymous = await evaluate('anonymous-api-denial', `Promise.all(['/api/purchases','/api/admin/products'].map(url=>fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.status)))`);
  assert.ok(anonymous.every(status => status === 401 || status === 403), 'FAIL: anonymous request reached a protected API.');
  console.log('PASS: anonymous purchase and admin APIs denied access.');
  console.log('Sign in with the approved development Google account in the opened browser. The temporary profile is deleted when this command exits.');
  await prompt.question('Press Enter after sign-in completes (or Ctrl+C to cancel): ');
  stage = 'manual-login-complete';
  await waitForLocalPage();
  const session = await evaluate('session-check', `fetch('/api/auth/get-session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.json()).then(x=>Boolean(x?.user?.id)).catch(()=>false)`);
  assert.equal(session, true, 'BLOCKED: no authenticated session; complete Google sign-in in this browser.');
  const protectedStatus = await evaluate('role-api-check', `fetch(${JSON.stringify(mode === 'customer' ? '/api/purchases' : '/api/admin/products')},{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.status)`);
  assert.equal(protectedStatus, 200, 'FAIL: authenticated role could not access its own protected API.');
  const routes = mode === 'customer'
    ? ['/account', '/account/library', '/account/orders', '/account/bookings']
    : ['/admin', '/admin/products', '/admin/categories', '/admin/bookings', '/admin/support', '/admin/coupons'];
  for (const route of routes) {
    stage = `protected-route:${route}`;
    await command('Page.navigate', { url: new URL(route, base).href });
    await waitForLocalPage();
    const result = await evaluate('protected-page-render', `new Promise(resolve=>{const until=Date.now()+10000;const check=()=>{const main=document.querySelector('main');if(document.readyState==='complete'&&main&&main.querySelector('h1'))resolve({path:location.pathname,heading:!!main.querySelector('h1'),blocked:!!document.querySelector('[role="alert"]')});else if(Date.now()>until)resolve({path:location.pathname,heading:false,blocked:true});else requestAnimationFrame(check)};check()})`);
    assert.equal(result.path, route, `FAIL: ${route} redirected or was denied`);
    assert.equal(result.heading, true, `FAIL: ${route} did not render a heading`);
    console.log(`PASS ${route}: authenticated page rendered`);
  }
  if (process.env.E2E_UX_ACCEPTANCE === 'true') {
    browserIssues.errors = 0;
    browserIssues.hydration = 0;
    const widths = [320, 390, 768, 1440];
    const uxRoutes = mode === 'customer'
      ? ['/account', '/account/library', '/account/orders', '/account/bookings']
      : ['/admin', '/admin/products'];
    const waitForUxRoute = async route => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        try {
          const state = await evaluate('ux-route-readiness', `({path:location.pathname,heading:!!document.querySelector('main h1'),loading:!!document.querySelector('main[role=status],main [role=status]')})`);
          if (state.path === route && state.heading) return;
        } catch (error) { if (!error.contextLost) throw error; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Protected UX route did not finish loading. route=${route}`);
    };
    for (const width of widths) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
      for (const theme of ['light', 'dark']) {
        await evaluate('ux-theme-setting', `localStorage.setItem('moneytreeventures-theme',${JSON.stringify(theme)})`);
        for (const route of uxRoutes) {
          stage = `ux:${mode}:${route}:${width}:${theme}`;
          await command('Page.navigate', { url: new URL(route, base).href });
          await waitForUxRoute(route);
          const themeReady = await evaluate('ux-theme-readiness', `new Promise(resolve=>{const end=Date.now()+5000;const check=()=>{if(document.documentElement.classList.contains('dark')===${theme === 'dark'})resolve(true);else if(Date.now()>end)resolve(false);else requestAnimationFrame(check)};check()})`);
          assert.equal(themeReady, true, `FAIL: ${theme} theme did not settle on ${route}`);
          const layout = await evaluate('ux-layout', `(()=>{const main=document.querySelector('main');const nav=document.querySelector('nav[aria-label="${mode === 'customer' ? 'Account navigation' : 'Admin navigation'}"]');const visible=nav&&getComputedStyle(nav).display!=='none';return {path:location.pathname,width:innerWidth,scroll:document.documentElement.scrollWidth,theme:document.documentElement.classList.contains('dark')?'dark':'light',nav:!!nav,visible:!!visible,heading:!!main?.querySelector('h1'),alerts:document.querySelectorAll('[role=alert]').length}})()`);
          assert.equal(layout.path, route, `FAIL: ${route} redirected during UX checks`);
          assert.equal(layout.width, width, `FAIL: viewport override failed on ${route}`);
          assert.ok(layout.scroll <= width, `FAIL: horizontal overflow on ${route} at ${width}px in ${theme}`);
          assert.equal(layout.theme, theme, `FAIL: theme mismatch on ${route}`);
          assert.equal(layout.nav, true, `FAIL: account/admin navigation missing on ${route}`);
          assert.equal(layout.heading, true, `FAIL: heading missing on ${route}`);
          assert.equal(layout.alerts, 0, `FAIL: an error alert appeared on ${route}`);
          if (mode === 'customer') assert.equal(layout.visible, true, `FAIL: customer navigation hidden on ${route}`);
          if (process.env.E2E_UX_CAPTURE_SAFE === 'true' && [390, 1440].includes(width) && route === (mode === 'admin' ? '/admin/products' : '/account/library')) {
            const safeTitle = await evaluate('ux-safe-capture-title', `document.querySelector('main h1')?.textContent===${JSON.stringify(mode === 'admin' ? 'Product management' : 'My Library')}`);
            assert.equal(safeTitle, true, 'FAIL: screenshot target has an unexpected heading; no screenshot saved.');
            const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: 0, y: 0, width, height: 220, scale: 1 } });
            const directory = path.join(process.cwd(), 'docs', 'ux-02a-screenshots');
            await mkdir(directory, { recursive: true });
            await writeFile(path.join(directory, `${mode}-${width}-${theme}-header.png`), Buffer.from(screenshot.data, 'base64'));
          }
          console.log(`PASS UX ${route}: ${width}px ${theme}, no horizontal overflow, navigation and heading present`);
        }
      }
    }
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const reduced = await evaluate('ux-reduced-motion', `matchMedia('(prefers-reduced-motion: reduce)').matches`);
    assert.equal(reduced, true, 'FAIL: reduced-motion browser emulation did not apply.');
    if (mode === 'admin') {
      stage = 'ux:admin:editor-overlay';
      await command('Page.navigate', { url: new URL('/admin/products', base).href });
      await waitForUxRoute('/admin/products');
      const opened = await evaluate('ux-editor-open', `(()=>{const trigger=Array.from(document.querySelectorAll('button')).find(button=>button.textContent?.includes('Add product'));if(!trigger)return false;trigger.dataset.uxEditorTrigger='true';trigger.click();return true})()`);
      assert.equal(opened, true, 'FAIL: admin product editor trigger missing.');
      const overlay = await evaluate('ux-editor-overlay', `new Promise(resolve=>{const end=Date.now()+5000;const check=()=>{const panel=document.querySelector('[role=dialog][aria-modal=true]');if(panel&&panel.contains(document.activeElement))resolve({open:true,inert:!!document.querySelector('header')?.inert,lock:document.body.style.overflow==='hidden',label:!!panel.getAttribute('aria-labelledby')});else if(Date.now()>end)resolve({open:false});else requestAnimationFrame(check)};check()})`);
      assert.ok(overlay.open && overlay.inert && overlay.lock && overlay.label, 'FAIL: product editor overlay focus, inertness, scroll lock or label.');
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      const closed = await evaluate('ux-editor-close', `new Promise(resolve=>{const end=Date.now()+5000;const check=()=>{if(!document.querySelector('[role=dialog]'))resolve({closed:true,restored:document.activeElement?.dataset.uxEditorTrigger==='true',scroll:document.body.style.overflow!=='hidden'});else if(Date.now()>end)resolve({closed:false});else requestAnimationFrame(check)};check()})`);
      assert.ok(closed.closed && closed.restored && closed.scroll, 'FAIL: product editor Escape, focus restoration or scroll cleanup.');
      console.log('PASS UX /admin/products: editor opened and closed without a save; focus, inert background and scroll state verified.');
    } else {
      stage = 'ux:customer:library-controls';
      await command('Page.navigate', { url: new URL('/account/library', base).href });
      await waitForUxRoute('/account/library');
      const library = await evaluate('ux-library-controls', `({library:!!document.querySelector('#library'),downloadButtons:Array.from(document.querySelectorAll('#library button')).filter(button=>/download/i.test(button.textContent||'')).length,empty:!!document.querySelector('#library')?.textContent?.includes('Your library is empty')})`);
      assert.equal(library.library, true, 'FAIL: library section missing.');
      console.log(`PASS UX /account/library: section rendered; download controls ${library.downloadButtons ? 'present' : library.empty ? 'absent in empty state' : 'not present in current records'}. No download was initiated.`);
    }
    assert.equal(browserIssues.hydration, 0, `FAIL: ${browserIssues.hydration} hydration warnings appeared during protected-route checks.`);
    console.log(`UX browser console: ${browserIssues.errors} error events, ${browserIssues.hydration} hydration warnings. No console content or account data was printed.`);
  }
  console.log('Read-only route checks finished. Sign out in the opened browser to verify session invalidation.');
  await prompt.question('Press Enter after signing out: ');
  stage = 'manual-signout-complete';
  await waitForLocalPage();
  const signedOut = await evaluate('signout-session-check', `fetch('/api/auth/get-session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>r.json()).then(x=>!x?.user?.id).catch(()=>false)`);
  assert.equal(signedOut, true, 'FAIL: session remained active after sign-out.');
  console.log('PASS: session invalidated after manual sign-out.');
} finally {
  prompt.close();
  socket?.close();
  child.kill();
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else { child.once('exit', resolve); setTimeout(resolve, 3000).unref(); } });
  await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => console.error('Temporary browser profile cleanup needs manual attention.'));
}
