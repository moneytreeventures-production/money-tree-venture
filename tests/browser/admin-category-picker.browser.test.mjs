import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { loadTranspiledTsx } from "./tsx-test-loader.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");
const browser = [process.env.CHROME_PATH, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe"), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean).find(existsSync);

test("admin category picker renders selected, inactive, loading, empty, and API error states accessibly", { skip: !browser && "Chromium/Chrome not installed" }, async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const sourcePath = path.join(root, "src/components/admin/product-category-picker.tsx");
  const { ProductCategoryPicker } = loadTranspiledTsx(sourcePath);
  const categories = [
    { _id: "active-1", name: "Freelancing aur content", status: "active" },
    { _id: "active-2", name: "Ghar se kaam", status: "active" },
    { _id: "inactive-1", name: "Archived assignment", status: "inactive" },
  ];
  const props = { categories, productCategoryIds: ["inactive-1"], selectedIds: ["active-1", "inactive-1"], loadState: "ready", loadError: "", onChange() {}, onRetry() {} };
  const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement("section", { id: "selection" }, React.createElement(ProductCategoryPicker, props)),
    React.createElement("section", { id: "empty" }, React.createElement(ProductCategoryPicker, { ...props, categories: [], productCategoryIds: [], selectedIds: [] })),
    React.createElement("section", { id: "error" }, React.createElement(ProductCategoryPicker, { ...props, loadState: "error", loadError: "Category API unavailable" })),
    React.createElement("section", { id: "loading" }, React.createElement(ProductCategoryPicker, { ...props, loadState: "loading" })),
  ));
  const directory = await mkdtemp(path.join(tmpdir(), "moneytree-admin-category-picker-"));
  try {
    const htmlPath = path.join(directory, "category-picker.html");
    await writeFile(htmlPath, `<!doctype html><html><body>${markup}<script>
      const checks = [];
      const selection = document.querySelector('#selection');
      const all = Array.from(selection.querySelectorAll('input[type=checkbox]'));
      if (!all.find((input) => input.value === 'active-1')?.checked) checks.push('selected value missing');
      if (all.find((input) => input.value === 'inactive-1')?.disabled) checks.push('existing inactive value cannot be removed');
      if (all.find((input) => input.value === 'active-2')?.disabled) checks.push('active category cannot be newly selected');
      if (!selection.textContent.includes('Selected: 2')) checks.push('selection count missing');
      const empty = document.querySelector('#empty');
      if (!empty.textContent.includes('No categories available') || empty.querySelector('a')?.getAttribute('href') !== '/admin/categories') checks.push('empty state/link missing');
      const error = document.querySelector('#error');
      if (!error.textContent.includes('Category API unavailable') || !error.querySelector('[role=alert]') || !error.textContent.includes('Retry categories')) checks.push('API error not distinguished from empty state');
      if (!document.querySelector('#loading [role=status]')) checks.push('loading state missing');
      document.body.dataset.result = checks.length ? 'fail' : 'pass';
      document.body.dataset.problems = checks.join('|');
    </script></body></html>`, "utf8");
    const result = spawnSync(browser, ["--headless", "--disable-gpu", "--disable-background-networking", "--no-sandbox", "--allow-file-access-from-files", "--dump-dom", `file:///${htmlPath.replaceAll("\\", "/")}`], { encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data-result="pass"/, result.stdout + result.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
