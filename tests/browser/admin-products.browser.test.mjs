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
function chromiumPath() {
  const candidates = [process.env.CHROME_PATH, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe"), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

test("admin product listing renders valid, empty, incomplete, legacy, and multiple records safely", { skip: !chromiumPath() && "Chromium/Chrome not installed" }, async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const sourcePath = path.join(root, "src/components/admin/admin-products.tsx");
  const { AdminProducts } = loadTranspiledTsx(sourcePath);

  const valid = { _id: "valid-1", name: "Valid guide", slug: "valid-guide", shortDescription: "A useful guide", productType: "pdf", categoryIds: ["category-1"], pricePaise: 12900, compareAtPricePaise: 14900, imageRefs: ["https://assets.example.test/cover.jpg"], featured: true, displayOrder: 0, publicationStatus: "draft", includedProductIds: [] };
  const products = [
    valid,
    { ...valid, _id: "no-image", name: "No thumbnail", slug: "no-thumbnail", imageRefs: undefined },
    { ...valid, _id: "missing-name", name: undefined, slug: undefined, title: "Legacy title only", imageRefs: [] },
    { ...valid, _id: "empty-name", name: "   ", slug: "" },
    { ...valid, _id: "optional-fields", name: "Optional fields", imageRefs: null, features: undefined, benefits: undefined, includedContent: undefined, faqs: undefined },
    null,
  ];
  const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement("section", { id: "populated" }, React.createElement(AdminProducts, { initialProducts: products, categories: [{ _id: "category-1", name: "Category A", status: "active" }] })),
    React.createElement("section", { id: "empty" }, React.createElement(AdminProducts, { initialProducts: [] })),
    React.createElement("section", { id: "loading" }, React.createElement(AdminProducts, null)),
  ));
  const directory = await mkdtemp(path.join(tmpdir(), "moneytree-admin-products-"));
  try {
    const html = `<!doctype html><html><body>${markup}<script>
      const problems = [];
      const populated = document.querySelector('#populated');
      const empty = document.querySelector('#empty');
      const loading = document.querySelector('#loading');
      if (populated.querySelectorAll('article').length !== 6) problems.push('one malformed record hid other product rows');
      if (!populated.textContent.includes('Valid guide')) problems.push('valid product missing');
      if (!populated.textContent.includes('Category A') || !populated.textContent.includes('Compare at INR 149.00') || !populated.textContent.includes('Featured')) problems.push('category/compare-at/featured details missing');
      if (!populated.textContent.includes('No image')) problems.push('missing thumbnail fallback missing');
      if (!populated.textContent.includes('Legacy title only')) problems.push('legacy title display fallback missing');
      if (!populated.textContent.includes('Unnamed product')) problems.push('empty-name fallback missing');
      if (!populated.textContent.includes('Slug unavailable')) problems.push('missing-slug fallback missing');
      if (!populated.textContent.includes('Product name missing') || !populated.textContent.includes('Record ID missing')) problems.push('invalid-record warnings missing');
      const noThumbnail = Array.from(populated.querySelectorAll('article')).find((row) => row.querySelector('h2')?.textContent === 'No thumbnail');
      const publish = noThumbnail && Array.from(noThumbnail.querySelectorAll('button')).find((button) => button.textContent === 'Publish');
      if (!noThumbnail || noThumbnail.querySelector('img') || !publish || publish.disabled) problems.push('optional thumbnail should use fallback without blocking draft lifecycle action');
      if (!loading.textContent.includes('Loading products...')) problems.push('initial loading state missing');
      const malformed = Array.from(populated.querySelectorAll('article')).find((row) => row.querySelector('h2')?.textContent === 'Legacy title only');
      if (!malformed || !malformed.textContent.includes('Legacy title is shown temporarily')) problems.push('legacy data warning missing');
      if (malformed && !Array.from(malformed.querySelectorAll('button')).find((button) => button.textContent === 'Publish')?.disabled) problems.push('invalid record could still be published');
      if (!empty.textContent.includes('No products match these filters.')) problems.push('empty collection state missing');
      document.body.dataset.browserResult = problems.length ? 'fail' : 'pass';
      document.body.dataset.browserProblems = problems.join('|');
    </script></body></html>`;
    const htmlPath = path.join(directory, "admin-products.html");
    await writeFile(htmlPath, html, "utf8");
    const result = spawnSync(chromiumPath(), ["--headless", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--no-first-run", "--no-default-browser-check", "--no-sandbox", "--allow-file-access-from-files", "--dump-dom", `file:///${htmlPath.replaceAll("\\", "/")}`], { encoding: "utf8", timeout: 15_000, windowsHide: true });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /data-browser-result="pass"/, result.stdout + result.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
