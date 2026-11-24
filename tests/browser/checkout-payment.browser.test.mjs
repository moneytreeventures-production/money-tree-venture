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

test("payment status control renders an accessible explicit verification action", { skip: !browser && "Chromium/Chrome not installed" }, async () => {
  const ts = require("typescript");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const sourcePath = path.join(root, "src/components/checkout/payment-status-check.tsx");
  const source = (await readFile(sourcePath, "utf8"))
    .replace('import { useRouter } from "next/navigation";', 'const useRouter = () => ({ refresh() {} });')
    .replace('import { classifyCustomerPaymentStatus, startPaymentStatusPolling } from "../../lib/payments/cashfree/status-polling";', 'const startPaymentStatusPolling = () => () => {}; const classifyCustomerPaymentStatus = () => "pending";');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const Module = require("node:module");
  const componentModule = new Module(sourcePath);
  componentModule.filename = sourcePath;
  componentModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  componentModule._compile(compiled, sourcePath);
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.PaymentStatusCheck, { orderId: "64b64c000000000000000001" }));
  assert.match(html, /Check payment status/);
  assert.match(html, /min-h-11/);
  const directory = await mkdtemp(path.join(tmpdir(), "moneytree-checkout-payment-"));
  try {
    const htmlPath = path.join(directory, "payment-status.html");
    await writeFile(htmlPath, `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><body>${html}<script>
      const button = document.querySelector('button');
      document.body.dataset.result = button?.textContent.trim() === 'Check payment status' && button?.type === 'button' ? 'pass' : 'fail';
    </script></body></html>`, "utf8");
    const result = spawnSync(browser, ["--headless", "--disable-gpu", "--disable-background-networking", "--no-sandbox", "--allow-file-access-from-files", "--window-size=390,844", "--dump-dom", `file:///${htmlPath.replaceAll("\\", "/")}`], { encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data-result="pass"/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("expired-order retry renders a deliberate button after safe finalization", { skip: !browser && "Chromium/Chrome not installed" }, async () => {
  const ts = require("typescript");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const sourcePath = path.join(root, "src/components/checkout/retry-expired-order.tsx");
  const source = (await readFile(sourcePath, "utf8"))
    .replace('import Link from "next/link";', 'const Link = ({ href, children }) => require("react").createElement("a", { href }, children);')
    .replace('import { useRouter } from "next/navigation";', 'const useRouter = () => ({ push() {}, refresh() {} });')
    .replace('import { useCart } from "@/components/cart/cart-provider";', 'const useCart = () => ({ items: [], ready: true, addItem() { return true; }, clearCart() {} });')
    .replace('import { canRetryExpiredOrder, retryOrderProductIds } from "@/lib/checkout/retry-order";', 'const canRetryExpiredOrder = () => true; const retryOrderProductIds = () => [];');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const Module = require("node:module");
  const componentModule = new Module(sourcePath);
  componentModule.filename = sourcePath;
  componentModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  componentModule._compile(compiled, sourcePath);
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.RetryExpiredOrder, { orderId: "6b0341108ffd602387cde275" }));
  assert.match(html, /Try Payment Again/);
  assert.match(html, /type="button"/);
  assert.match(html, /min-h-11/);
});
