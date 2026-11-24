import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const Module = require("node:module");

test("homepage uses bounded public query and renders real records, empty and error states", async () => {
  let items = [];
  let failure = false;
  let logged = false;
  const filename = path.resolve("src/components/home/featured-products.tsx");
  const component = new Module(filename);
  component.filename = filename;
  component.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = component.require.bind(component);
  component.require = (id) => {
    if (id === "next/server") return { connection: async () => {} };
    if (id === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (id.includes("product-service")) return { listPublicProducts: async (query) => {
      assert.deepEqual(query, { page: 1, pageSize: 6, sort: "featured" });
      if (failure) throw Error("private diagnostic");
      return { items };
    }};
    if (id.includes("/logger")) return { logger: { error: () => { logged = true; } } };
    if (id.includes("/currency")) return { formatINR: (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n / 100) };
    if (id.includes("product-main-media")) return { ProductMainMedia: (props) => { assert.equal(props.promotionalVideoUrl, undefined); return React.createElement("div", null, "Media fallback"); } };
    if (id.includes("product-purchase-action")) return { ProductPurchaseAction: ({ productId }) => React.createElement("button", { "data-product": productId }, "Add to cart") };
    return originalRequire(id);
  };
  component._compile(ts.transpileModule(readFileSync(filename,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  const render = async () => renderToStaticMarkup(await component.exports.default());
  assert.match(await render(), /no published products/);
  items = [{ _id: "fixture-id", name: "Fixture PDF", slug: "fixture-pdf", shortDescription: "Fixture only", pricePaise: 12345, productType: "pdf", featured: true }];
  const html = await render();
  assert.match(html, /href="\/products\/fixture-pdf"/);
  assert.match(html, /123.45/);
  assert.match(html, /data-product="fixture-id"/);
  failure = true;
  const failed = await render();
  assert.match(failed, /temporarily unavailable/);
  assert.doesNotMatch(failed, /private diagnostic|no published products/);
  assert.equal(logged, true);
});
