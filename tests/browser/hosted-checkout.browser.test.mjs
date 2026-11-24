import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import path from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(import.meta.dirname, "../..");

function loadTs(file, dependencies = {}) {
  const filename = path.join(root, file);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = mod.require.bind(mod);
  mod.require = (name) => name in dependencies ? dependencies[name] : originalRequire(name);
  mod._compile(code, filename);
  return mod.exports;
}

function find(node, type, predicate = () => true) {
  if (!node || typeof node !== "object") return null;
  if (node.type === type && predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, type, predicate);
    if (match) return match;
  }
  return null;
}

test("hosted checkout sends a valid mobile string and clears stale errors on edit", async () => {
  const mobile = loadTs("src/lib/payments/cashfree/mobile-phone.ts");
  const feedback = loadTs("src/lib/payments/cashfree/payment-feedback.ts");
  const state = [];
  let cursor = 0;
  const fakeReact = { useState(initial) {
    const slot = cursor++;
    if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
    return [state[slot], (value) => { state[slot] = value; }];
  }, useRef(initial) {
    const slot = cursor++;
    if (!(slot in state)) state[slot] = { current: initial };
    return state[slot];
  } };
  const jsx = (type, props) => ({ type, props });
  const component = loadTs("src/components/checkout/hosted-checkout.tsx", {
    react: fakeReact,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/script": () => null,
    "@/lib/format/currency": { formatINR: () => "₹100" },
    "@/lib/payments/cashfree/mobile-phone": mobile,
    "@/lib/payments/cashfree/payment-feedback": feedback,
  }).HostedCheckout;
  const render = () => { cursor = 0; return component({ orderId: "64b64c000000000000000001", orderReference: "MTV-1", totalPaise: 10000 }); };
  const oldFetch = globalThis.fetch;
  let sentPhone;
  let callCount = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      callCount++;
      sentPhone = JSON.parse(init.body).phone;
      return Response.json({ success: false, error: { code: "VALIDATION_ERROR", details: [{ field: "order" }] } }, { status: 400 });
    };
    let tree = render();
    assert.match(find(tree, "section").props.className, /min-w-0/);
    assert.equal(find(tree, "input").props.pattern, "[6-9][0-9]{9}");
    find(tree, "input").props.onChange({ target: { value: " 71234 56789 " } });
    tree = render();
    await find(tree, "form").props.onSubmit({ preventDefault() {} });
    assert.equal(sentPhone, "7123456789");
    assert.equal(typeof sentPhone, "string");
    assert.equal(callCount, 1);
    tree = render();
    assert.match(find(tree, "p", (item) => item.props.role === "alert").props.children, /order cannot be paid/i);
    find(tree, "input").props.onChange({ target: { value: "7123456789" } });
    tree = render();
    assert.equal(find(tree, "p", (item) => item.props.className?.includes("rose-700")).props.children, "");
    find(tree, "input").props.onChange({ target: { value: "5123456789" } });
    tree = render();
    await find(tree, "form").props.onSubmit({ preventDefault() {} });
    assert.equal(callCount, 1);
    assert.equal(find(render(), "p", (item) => item.props.role === "alert").props.children, feedback.PHONE_VALIDATION_MESSAGE);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
