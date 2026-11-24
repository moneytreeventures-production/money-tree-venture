import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
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
const child = spawn(browser, ['--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, new URL('/login', base).href], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: false });
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
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); const item = pending.get(message.id); if (item) { clearTimeout(item.timeout); pending.delete(message.id); if (message.error) item.reject(new Error('Browser command failed.')); else item.resolve(message.result); } });
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
