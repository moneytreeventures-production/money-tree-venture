import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadTranspiledTsx } from '../browser/tsx-test-loader.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { SkeletonCartSummary } = loadTranspiledTsx(path.join(process.cwd(), 'src/components/ui/skeleton.tsx'));
const skeletonMarkup = renderToStaticMarkup(React.createElement(SkeletonCartSummary));

const base = new URL(process.env.E2E_BASE_URL || 'http://localhost:3000');
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);

function contrastRatio(first, second) {
  const luminance = color => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    assert.equal(channels?.length, 3, `Unexpected computed color: ${color}`);
    const [red, green, blue] = channels.map(value => {
      const component = value / 255;
      return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
    });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('UX foundation: real mobile/desktop viewport, theme, menu, and reduced motion', { timeout: 90000 }, async t => {
  if (!chrome) return t.skip('Chrome or Edge is not installed.');
  if (base.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(base.hostname) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
    throw new Error('UX browser test requires a plain localhost origin.');
  }
  try { await fetch(new URL('/favicon.ico', base), { signal: AbortSignal.timeout(5000) }); }
  catch { return t.skip('Local dev server is unavailable.'); }

  const profile = await mkdtemp(path.join(tmpdir(), 'mtv-ux01-'));
  const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome startup timed out.')), 10000);
      child.once('error', reject);
      child.stderr.on('data', chunk => {
        const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const targets = await (await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0;
    const pending = new Map();
    let productPrerenderWarnings = 0;
    let currentRoute = 'startup';
    const hydrationWarnings = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        const description = message.params.args?.map(arg => String(arg.value ?? arg.description ?? '')).join(' ') ?? '';
        if (description.includes('Route "/products/[slug]"') && description.includes('unstable value `Date.now()`')) productPrerenderWarnings++;
        if (/hydration failed|server rendered html didn't match/i.test(description)) hydrationWarnings.push({ route: currentRoute, category: /server rendered html didn't match/i.test(description) ? 'markup_mismatch' : 'hydration_failed', evidence: description.split('\n').filter(line => /^\s*[+-]\s|style=|<Reveal/.test(line)).slice(0, 12).map(line => line.trim().slice(0, 120)) });
      }
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(`Browser command failed: ${item.method}`));
      else item.resolve(message.result);
    });
    const command = (method, params = {}) => new Promise((resolve, reject) => {
      const commandId = ++id;
      const timer = setTimeout(() => { pending.delete(commandId); reject(new Error(`Browser command timed out: ${method}`)); }, 15000);
      pending.set(commandId, { method, resolve, reject, timer });
      socket.send(JSON.stringify({ id: commandId, method, params }));
    });
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error('Browser evaluation failed.');
      return result.result.value;
    };
    const capture = async (name, folder = 'ux-01-screenshots') => {
      if (process.env.UX_CAPTURE_SCREENSHOTS !== 'true') return;
      const directory = path.join(process.cwd(), 'docs', folder);
      await mkdir(directory, { recursive: true });
      const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path.join(directory, name + '.png'), Buffer.from(screenshot.data, 'base64'));
    };
    const waitFor = condition => evaluate(`new Promise(resolve=>{const end=Date.now()+10000;const check=()=>{if(${condition})resolve(true);else if(Date.now()>end)resolve(false);else requestAnimationFrame(check)};check()})`);
    await command('Page.enable');
    await command('Runtime.enable');

    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
      for (const route of ['/', '/products', '/cart', '/checkout']) {
        currentRoute = route;
        await command('Page.navigate', { url: new URL(route, base).href });
        assert.equal(await waitFor(`!!document.querySelector('main h1')||!!document.querySelector('main[role=status], main [role=status]')`), true, `Content or loading state missing on ${route}.`);
        const layout = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,heading:document.querySelector('main h1')?.textContent,loading:document.querySelector('main[role=status], main [role=status]')?.textContent})`);
        assert.equal(layout.width, width);
        assert.ok(layout.scrollWidth <= width, `Horizontal overflow on ${route} at ${width}px.`);
        if (route === '/products' && layout.heading) assert.ok(layout.heading.includes('Choose a resource'));
        if (!layout.heading) assert.ok(layout.loading?.trim(), `Loading state on ${route} lacks an announcement.`);
      }
    }

    await t.test('published product detail metadata avoids prerender clock errors', async context => {
      const response = await fetch(new URL('/api/products?page=1&pageSize=1', base), { signal: AbortSignal.timeout(7000) }).catch(() => null);
      if (!response?.ok) return context.skip('Published product API unavailable in this local environment.');
      const payload = await response.json();
      const product = payload.data?.items?.[0];
      if (!product?.slug) return context.skip('No published product is available for the route check.');
      productPrerenderWarnings = 0;
      currentRoute = '/products/[slug]';
      await command('Page.navigate', { url: new URL(`/products/${encodeURIComponent(product.slug)}`, base).href });
      assert.equal(await waitFor(`document.querySelector('h1')?.textContent===${JSON.stringify(product.name)}&&document.title.length>0`), true);
      const title = await evaluate('document.title');
      assert.ok(!title.includes('Product not found'), 'Product metadata fell back to not-found.');
      assert.equal(productPrerenderWarnings, 0, 'Product metadata accessed the MongoDB clock during prerender.');
    });

    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
    currentRoute = '/';
    await command('Page.navigate', { url: new URL('/', base).href });
    assert.equal(await waitFor(`document.querySelector('button[aria-label="light. Change theme"]')!==null`), true, 'Theme control did not hydrate.');
    const touchTargets = await evaluate(`(()=>{const menu=document.querySelector('button[aria-label="Open menu"]').getBoundingClientRect();const theme=Array.from(document.querySelectorAll('button[aria-label="light. Change theme"]')).map(button=>button.getBoundingClientRect()).find(rect=>rect.width>0);return {menu:[menu.width,menu.height],theme:theme?[theme.width,theme.height]:[]}})()`);
    assert.ok(touchTargets.theme.length === 2 && [...touchTargets.menu, ...touchTargets.theme].every(size => size >= 44), `Header touch targets are smaller than 44px: ${JSON.stringify(touchTargets)}`);
    const lightColors = await evaluate(`({background:getComputedStyle(document.body).backgroundColor,heading:getComputedStyle(document.querySelector('h1')).color,button:getComputedStyle(document.querySelector('main a.mt-button-primary')).color,buttonBackground:getComputedStyle(document.querySelector('main a.mt-button-primary')).backgroundColor})`);
    assert.ok(contrastRatio(lightColors.heading, lightColors.background) >= 4.5, 'Light heading contrast is too low.');
    assert.ok(contrastRatio(lightColors.button, lightColors.buttonBackground) >= 4.5, 'Light primary action contrast is too low.');
    await evaluate(`document.querySelector('button[aria-label="Open menu"]').click()`);
    assert.equal(await waitFor(`document.querySelector('button[aria-expanded="true"]')!==null&&document.querySelector('#mobile-navigation')!==null`), true, 'Mobile menu did not open.');
    assert.ok(await evaluate(`document.querySelectorAll('#mobile-navigation a').length`) >= 5);
    await capture('mobile-menu-390');
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await waitFor(`document.querySelector('#mobile-navigation')===null`), true, 'Escape did not close the menu.');
    assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Open menu', 'Focus was not restored to the menu button.');
    assert.equal(await evaluate(`document.activeElement?.matches(':focus-visible')`), true, 'Restored menu focus is not visibly indicated.');

    await evaluate(`document.querySelector('button[aria-label="light. Change theme"]').click()`);
    assert.equal(await waitFor(`document.documentElement.classList.contains('dark')&&getComputedStyle(document.body).backgroundColor==='rgb(11, 20, 35)'`), true, 'Dark theme did not activate.');
    const dark = await evaluate(`({background:getComputedStyle(document.body).backgroundColor,heading:getComputedStyle(document.querySelector('h1')).color,buttonColor:getComputedStyle(document.querySelector('main a.mt-button-primary')).color,buttonBackground:getComputedStyle(document.querySelector('main a.mt-button-primary')).backgroundColor})`);
    assert.equal(dark.background, 'rgb(11, 20, 35)');
    assert.equal(dark.buttonColor, 'rgb(15, 30, 54)', 'Primary action lost navy text in dark mode.');
    assert.ok(contrastRatio(dark.heading, dark.background) >= 4.5, 'Dark heading contrast is too low.');
    assert.ok(contrastRatio(dark.buttonColor, dark.buttonBackground) >= 4.5, 'Dark primary action contrast is too low.');
    await capture('home-390-dark');

    if (process.env.UX_CAPTURE_SCREENSHOTS === 'true') {
      const published = await fetch(new URL('/api/products?page=1&pageSize=1', base), { signal: AbortSignal.timeout(5000) })
        .then(response => response.json()).then(payload => payload.data?.items?.[0]).catch(() => null);
      const visualRoutes = [['home', '/'], ['products', '/products']];
      if (published?.slug) visualRoutes.push(['detail', `/products/${encodeURIComponent(published.slug)}`]);
      for (const width of [390, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
        for (const theme of ['light', 'dark']) {
          await command('Page.navigate', { url: new URL('/', base).href });
          assert.equal(await waitFor(`document.readyState==='complete'&&!!document.querySelector('h1')`), true);
          await evaluate(`localStorage.setItem('moneytreeventures-theme',${JSON.stringify(theme)})`);
          for (const [name, route] of visualRoutes) {
            await command('Page.navigate', { url: new URL(route, base).href });
            assert.equal(await waitFor(`document.readyState==='complete'&&!!document.querySelector('h1')&&document.documentElement.classList.contains(${JSON.stringify(theme)})`), true);
            if (name === 'home') assert.equal(await waitFor(`getComputedStyle(document.querySelector('h1').closest('[style]')).opacity==='1'`), true);
            await capture(`${name}-${width}-${theme}`);
            if (name === 'products' && await waitFor(`document.querySelector('main article')!==null`)) {
              await evaluate(`(()=>{document.documentElement.style.scrollBehavior='auto';const card=document.querySelector('main article');window.scrollTo(0,card.getBoundingClientRect().top+scrollY-100)})()`);
              assert.equal(await waitFor(`scrollY>0`), true);
              await capture(`catalog-card-${width}-${theme}`);
            }
          }
        }
      }
    }

    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
    await command('Page.navigate', { url: new URL('/', base).href });
    assert.equal(await waitFor(`!!document.querySelector('main a.mt-button-primary')`), true);
    const reduced = await evaluate(`({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,duration:getComputedStyle(document.querySelector('main a.mt-button-primary')).transitionDuration})`);
    assert.equal(reduced.matches, true);
    assert.ok(reduced.duration.split(',').every(value => parseFloat(value) <= 0.001), 'Reduced-motion transition remains active.');
    assert.equal(await waitFor(`getComputedStyle(document.querySelector('[data-mt-reveal]')).opacity==='1'`), true, 'Reduced-motion hero content is hidden.');
    const skeletonColors = new Set();
    for (const width of [320, 390, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
      for (const theme of ['light', 'dark']) {
        const result = await evaluate(`(()=>{document.documentElement.classList.toggle('dark',${theme === 'dark'});const host=document.createElement('div');host.id='ux02-skeleton-fixture';host.innerHTML=${JSON.stringify(skeletonMarkup)};document.body.append(host);const main=host.querySelector('main');const block=host.querySelector('.mt-skeleton');const result={width:main.getBoundingClientRect().width,height:main.getBoundingClientRect().height,scrollWidth:document.documentElement.scrollWidth,color:getComputedStyle(block).backgroundColor,statusCount:host.querySelectorAll('[role=status]').length};main.scrollIntoView({block:'start'});return result})()`);
        assert.ok(result.width <= width && result.scrollWidth <= width, `Skeleton overflows at ${width}px in ${theme} mode.`);
        assert.ok(result.height >= 300, 'Cart skeleton does not reserve summary height.');
        assert.equal(result.statusCount, 1, 'Cart skeleton has duplicate loading announcements.');
        assert.match(result.color, /^rgb\(/, 'Skeleton theme color was not applied.');
        skeletonColors.add(result.color);
        if (width === 390) await capture(`skeleton-cart-390-${theme}`, 'ux-02-screenshots');
        await evaluate(`document.querySelector('#ux02-skeleton-fixture').remove()`);
      }
    }
    assert.equal(skeletonColors.size, 2, 'Light and dark skeleton colors should differ.');
    assert.equal(hydrationWarnings.length, 0, `Hydration warning appeared during public-route checks: ${JSON.stringify(hydrationWarnings)}`);
  } finally {
    socket?.close();
    child.kill();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
