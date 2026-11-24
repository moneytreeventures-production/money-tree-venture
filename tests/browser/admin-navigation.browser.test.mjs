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
const browser = [process.env.CHROME_PATH, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe"), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean).find(existsSync);

test("Manage products CTA has a clear brand treatment, focus state, and correct destination", { skip: !browser && "Chromium/Chrome not installed" }, async () => {
  const ts = require("typescript");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const sourcePath = path.join(root, "src/components/admin/manage-products-link.tsx");
  const source = await readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const Module = require("node:module");
  const componentModule = new Module(sourcePath);
  componentModule.filename = sourcePath;
  componentModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  componentModule._compile(compiled, sourcePath);
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.ManageProductsLink));
  const directory = await mkdtemp(path.join(tmpdir(), "moneytree-admin-navigation-"));
  try {
    const htmlPath = path.join(directory, "manage-products.html");
    await writeFile(htmlPath, `<!doctype html><html><body>${html}<script>
      const link = document.querySelector('a');
      const expected = ['bg-accent','text-[#0f1e36]','hover:bg-accent-hover','focus-visible:outline-accent'];
      document.body.dataset.result = link?.getAttribute('href') === '/admin/products' &&
        link.textContent.trim() === 'Manage products' && expected.every((token) => link.className.includes(token)) ? 'pass' : 'fail';
    </script></body></html>`, "utf8");
    const result = spawnSync(browser, ["--headless", "--disable-gpu", "--disable-background-networking", "--no-sandbox", "--allow-file-access-from-files", "--dump-dom", `file:///${htmlPath.replaceAll("\\", "/")}`], { encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data-result="pass"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
