import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadTranspiledTsx } from '../browser/tsx-test-loader.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '../..');
const browser = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')].filter(Boolean).find(existsSync);

test('shared skeletons reserve real regions and announce loading once', () => {
  const parts = loadTranspiledTsx(path.join(root, 'src/components/ui/skeleton.tsx'));
  for (const [name, expected] of [
    ['FeaturedProductsSkeleton', 'Loading featured products...'],
    ['CatalogueSkeleton', 'Loading catalogue...'],
    ['SkeletonCartSummary', 'Loading your cart...'],
    ['SkeletonCheckoutSummary', 'Preparing checkout...'],
    ['SkeletonAccountContent', 'Loading your account...'],
    ['SkeletonDataTable', 'Loading products...'],
  ]) {
    const html = renderToStaticMarkup(React.createElement(parts[name]));
    assert.equal((html.match(/role="status"/g) ?? []).length, 1, `${name} should have one loading announcement`);
    assert.match(html, new RegExp(expected.replaceAll('.', '\\.')));
    assert.match(html, /aria-hidden="true"/);
  }
  assert.match(renderToStaticMarkup(React.createElement(parts.SkeletonProductCard)), /aspect-\[1\.55\/1\]/);
  assert.match(renderToStaticMarkup(React.createElement(parts.SkeletonProductCard, { mediaAspect: 'featured' })), /aspect-\[4\/3\]/);
});

test('feedback keeps visual states separate from payment or provider outcomes', () => {
  const { Feedback } = loadTranspiledTsx(path.join(root, 'src/components/ui/feedback.tsx'));
  const error = renderToStaticMarkup(React.createElement(Feedback, { tone: 'error', action: React.createElement('button', null, 'Retry') }, 'Could not load'));
  const empty = renderToStaticMarkup(React.createElement(Feedback, { tone: 'empty' }, 'Nothing here'));
  const success = renderToStaticMarkup(React.createElement(Feedback, { tone: 'success' }, 'Saved'));
  assert.match(error, /role="alert"/);
  assert.match(error, /Retry/);
  assert.doesNotMatch(empty, /role="(status|alert)"/);
  assert.match(success, /role="status"/);
});

test('Reveal keeps meaningful content visible in server HTML', () => {
  const { default: Reveal } = loadTranspiledTsx(path.join(root, 'src/components/ui/reveal.tsx'));
  const html = renderToStaticMarkup(React.createElement(Reveal, null, React.createElement('h2', null, 'Important heading')));
  assert.match(html, /Important heading/);
  assert.doesNotMatch(html, /opacity:0|visibility:hidden|display:none/);
});

test('overlay renders labelled dialog and drawer semantics', () => {
  const { AccessibleOverlay } = loadTranspiledTsx(path.join(root, 'src/components/ui/accessible-overlay.tsx'));
  for (const variant of ['dialog', 'drawer']) {
    const html = renderToStaticMarkup(React.createElement(AccessibleOverlay, { open: true, onClose: () => {}, titleId: 'overlay-title', descriptionId: 'overlay-description', variant },
      React.createElement('h2', { id: 'overlay-title' }, 'Editor'), React.createElement('p', { id: 'overlay-description' }, 'Details')));
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /aria-labelledby="overlay-title"/);
    assert.match(html, /aria-describedby="overlay-description"/);
    assert.match(html, /tabindex="-1"/);
  }
});

test('overlay controller traps focus, closes topmost on Escape and restores scroll/focus', { skip: !browser && 'Chrome or Edge unavailable' }, async () => {
  const source = readFileSync(path.join(root, 'src/components/ui/overlay-controller.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace('export function activateOverlay', 'function activateOverlay');
  const directory = await mkdtemp(path.join(tmpdir(), 'mtv-overlay-'));
  try {
    const html = `<!doctype html><html><body><button id="trigger">Open</button><div id="outer" tabindex="-1"><button id="first">First</button><button id="last">Last</button></div><div id="inner" tabindex="-1"><button id="inner-first">Inner</button></div><button id="outside">Outside</button><script>${compiled}
      const results=[], focuses=[];
      const outer=document.querySelector('#outer'), inner=document.querySelector('#inner');
      document.querySelector('#trigger').focus();
      const closeOuter=activateOverlay(outer,()=>{cleanupOuter();outer.remove()});
      const cleanupOuter=closeOuter;
      queueMicrotask(()=>{
        results.push(document.activeElement.id==='first' && document.body.style.overflow==='hidden' && document.querySelector('#outside').inert);
        document.querySelector('#last').focus();
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
        results.push(document.activeElement.id==='first');
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
        results.push(document.activeElement.id==='last');
        document.querySelector('#outside').focus();
        focuses.push(document.activeElement.id);
        results.push(outer.contains(document.activeElement));
        const cleanupInner=activateOverlay(inner,()=>{cleanupInner();inner.remove()});
        queueMicrotask(()=>{
          results.push(document.activeElement.id==='inner-first' && outer.inert);
          focuses.push(document.activeElement.id);
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
          focuses.push(document.activeElement.id);
          results.push(!inner.isConnected && outer.isConnected && !outer.inert && document.querySelector('#outside').inert && document.body.style.overflow==='hidden' && outer.contains(document.activeElement));
          document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
          results.push(!outer.isConnected && !document.querySelector('#outside').inert && document.body.style.overflow==='' && document.activeElement.id==='trigger');
          document.body.dataset.overlayChecks=results.map(Boolean).join(',');
          document.body.dataset.overlayFocuses=focuses.join(',');
          document.body.dataset.overlayResult=results.every(Boolean)?'pass':'fail';
        });
      });
    </script></body></html>`;
    const file = path.join(directory, 'overlay.html');
    await writeFile(file, html, 'utf8');
    const result = spawnSync(browser, ['--headless=new', '--no-sandbox', '--disable-background-networking', '--disable-extensions', '--no-first-run', `--user-data-dir=${directory}`, '--allow-file-access-from-files', '--dump-dom', `file:///${file.replaceAll('\\', '/')}`], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr.slice(0, 500));
    const checks = result.stdout.match(/data-overlay-checks="([^"]+)"/)?.[1];
    const focuses = result.stdout.match(/data-overlay-focuses="([^"]+)"/)?.[1];
    assert.equal(result.stdout.includes('data-overlay-result="pass"'), true, `Overlay checks: ${checks ?? 'not completed'}; focus: ${focuses ?? 'unknown'}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
