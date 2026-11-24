import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");

function chromiumPath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright/chromium-1243/chrome-win64/chrome.exe"),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

test("browser confirms product video and thumbnail presentation rules", { skip: !chromiumPath() && "Chromium/Chrome not installed" }, async () => {
  const ts = require("typescript");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const sourcePath = path.join(root, "src/components/catalog/product-main-media.tsx");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const Module = require("node:module");
  const componentModule = new Module(sourcePath);
  componentModule.filename = sourcePath;
  componentModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  componentModule._compile(compiled, sourcePath);
  const { ProductMainMedia } = componentModule.exports;

  const videoMarkup = renderToStaticMarkup(React.createElement(ProductMainMedia, {
    name: "Preview guide", thumbnailRef: "https://assets.example.test/cover.jpg", promotionalVideoUrl: "https://assets.example.test/preview.mp4",
  }));
  const thumbnailMarkup = renderToStaticMarkup(React.createElement(ProductMainMedia, {
    name: "PDF guide", thumbnailRef: "https://assets.example.test/cover.jpg",
  }));
  const invalidMarkup = renderToStaticMarkup(React.createElement(ProductMainMedia, {
    name: "No media", thumbnailRef: "javascript:alert(1)", promotionalVideoUrl: "javascript:alert(1)",
  }));
  const testDirectory = await mkdtemp(path.join(tmpdir(), "moneytree-product-media-"));
  try {
    const html = `<!doctype html><html><body><section id="video">${videoMarkup}</section><section id="thumbnail">${thumbnailMarkup}</section><section id="invalid">${invalidMarkup}</section><script>
      const video = document.querySelector('#video video');
      const thumb = document.querySelector('#thumbnail img');
      const invalidImage = document.querySelector('#invalid img');
      const problems = [];
      if (!video) problems.push('video media missing');
      if (video && (video.getAttribute('preload') !== 'none' || !video.controls || !video.playsInline || video.autoplay)) problems.push('video controls/preload/paused rules failed');
      if (video && video.getAttribute('poster') !== 'https://assets.example.test/cover.jpg') problems.push('video poster missing');
      if (document.querySelectorAll('#video img').length) problems.push('thumbnail rendered as a second main image');
      if (!thumb || thumb.getAttribute('src') !== 'https://assets.example.test/cover.jpg') problems.push('thumbnail fallback missing');
      if (invalidImage || document.querySelector('#invalid video') || document.querySelector('#invalid [src^="javascript:"]')) problems.push('unsafe media was not handled');
      document.body.dataset.browserResult = problems.length ? 'fail' : 'pass';
      document.body.dataset.browserProblems = problems.join('|');
    </script></body></html>`;
    const htmlPath = path.join(testDirectory, "media.html");
    await writeFile(htmlPath, html, "utf8");
    const result = spawnSync(chromiumPath(), ["--headless", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--no-first-run", "--no-default-browser-check", "--no-sandbox", "--allow-file-access-from-files", "--dump-dom", `file:///${htmlPath.replaceAll("\\", "/")}`], { encoding: "utf8", timeout: 12_000, windowsHide: true });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data-browser-result="pass"/, result.stdout + result.stderr);
  } finally {
    await rm(testDirectory, { recursive: true, force: true });
  }
});
