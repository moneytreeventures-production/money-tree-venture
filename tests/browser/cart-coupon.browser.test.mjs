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

test("cart only renders a confirmed coupon quote for the current cart and price signature", { skip: !browser && "Chromium/Chrome not installed" }, async () => {
  const ts = require("typescript");
  const sourcePath = path.join(root, "src/lib/coupons/preview-pricing.ts");
  const source = await readFile(sourcePath, "utf8");
  const component = await readFile(path.join(root, "src/components/cart/cart-page.tsx"), "utf8");
  assert.match(component, /isCouponQuoteCurrent\(coupon, cartKey\)/);
  assert.match(component, /canCommitCouponPreview\(controller\.signal, cartKey, cartKey\)/);
  assert.match(component, /signal: controller\.signal/);
  assert.match(component, /JSON\.stringify\(\{ code: appliedCouponCode, items \}\)/);
  const helperSource = source.slice(source.indexOf("export function isCouponQuoteCurrent"), source.indexOf("export interface CouponPreviewItem"));
  const compiled = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helperModule = new (require("node:module"))("coupon-quote-check");
  helperModule._compile(compiled, "coupon-quote-check.js");
  const matches = helperModule.exports.isCouponQuoteCurrent;
  const canCommit = helperModule.exports.canCommitCouponPreview;
  const oldQuoteVisible = matches({ cartKey: "productA:2000" }, "productA:3000");
  const latestQuoteVisible = matches({ cartKey: "productA:3000" }, "productA:3000");
  const oldResponseCanCommit = canCommit({ aborted: false }, "productA:2000", "productA:3000");
  const directory = await mkdtemp(path.join(tmpdir(), "moneytree-cart-coupon-"));
  try {
    const htmlPath = path.join(directory, "cart-coupon.html");
    await writeFile(htmlPath, `<!doctype html><html><body><p id="discount"></p><script>
      const oldQuoteVisible = ${JSON.stringify(oldQuoteVisible)};
      const latestQuoteVisible = ${JSON.stringify(latestQuoteVisible)};
      document.querySelector('#discount').textContent = latestQuoteVisible && !oldQuoteVisible ? 'Discount confirmed' : 'Stale discount';
      document.body.dataset.result = !oldQuoteVisible && latestQuoteVisible && ${JSON.stringify(oldResponseCanCommit)} === false ? 'pass' : 'fail';
    </script></body></html>`, "utf8");
    const result = spawnSync(browser, ["--headless", "--disable-gpu", "--disable-background-networking", "--no-sandbox", "--allow-file-access-from-files", "--dump-dom", `file:///${htmlPath.replaceAll("\\", "/")}`], { encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data-result="pass"/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
