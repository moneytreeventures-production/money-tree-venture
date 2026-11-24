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

test("Review order blocks rapid duplicate submissions and rotates a mismatched retry key", async () => {
  const state = [];
  let cursor = 0;
  const react = {
    useMemo: (factory) => factory(),
    useState(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
      return [state[slot], (value) => { state[slot] = value; }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = { current: initial };
      return state[slot];
    },
  };
  const jsx = (type, props) => ({ type, props });
  let key = "attempt-key-00000001";
  let cleared = 0;
  let fetchCount = 0;
  let resolveFirst;
  const oldFetch = globalThis.fetch;
  const requests = [];
  const component = loadTs("src/components/checkout/checkout-start.tsx", {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": () => null,
    "next/navigation": { useRouter: () => ({ replace() {}, refresh() {} }), useSearchParams: () => ({ get: () => "SAVE10" }) },
    "lucide-react": { ArrowRight: () => null, LoaderCircle: () => null },
    "@/lib/auth/client": { authClient: { useSession: () => ({ data: { user: { name: "Buyer" } }, isPending: false }) } },
    "@/components/cart/cart-provider": { useCart: () => ({ ready: true, items: [{ productId: "64b64c000000000000000001", quantity: 1 }], clearCart() {} }) },
    "@/lib/checkout/client-idempotency": {
      checkoutSignature: () => "cart-signature",
      getCheckoutIdempotencyKey: () => key,
      clearCheckoutIdempotencyKey: () => { cleared++; key = "attempt-key-00000002"; },
    },
    "@/lib/checkout/order-error": loadTs("src/lib/checkout/order-error.ts"),
  }).default;
  const render = () => { cursor = 0; return component(); };
  try {
    globalThis.fetch = async (_url, init) => {
      fetchCount++;
      requests.push({ key: init.headers["idempotency-key"], body: JSON.parse(init.body) });
      if (fetchCount === 1) return await new Promise((resolve) => { resolveFirst = resolve; });
      return Response.json({ success: false, error: { code: "ORDER_CREATE_COLLISION" } }, { status: 409 });
    };
    const form = find(render(), "form");
    const first = form.props.onSubmit({ preventDefault() {} });
    await form.props.onSubmit({ preventDefault() {} });
    assert.equal(fetchCount, 1);
    assert.deepEqual(requests[0].body, { items: [{ productId: "64b64c000000000000000001", quantity: 1 }], couponCode: "SAVE10" });
    resolveFirst(Response.json({ success: false, error: { code: "ORDER_RETRY_MISMATCH" } }, { status: 409 }));
    await first;
    assert.equal(cleared, 1);
    assert.match(find(render(), "p", (node) => node.props.role === "alert").props.children, /cart changed/i);
    await find(render(), "form").props.onSubmit({ preventDefault() {} });
    assert.equal(fetchCount, 2);
    assert.notEqual(requests[0].key, requests[1].key);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
