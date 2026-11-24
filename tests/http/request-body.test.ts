import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../../src/lib/errors/app-error";
import { JSON_REQUEST_BODY_MAX_BYTES, readJsonBody } from "../../src/lib/catalog/route-utils";

test("bounded JSON request reader parses valid JSON", async () => {
  const request = new Request("https://example.test/api", { method: "POST", body: '{"ok":true}' });
  assert.deepEqual(await readJsonBody(request), { ok: true });
});

test("bounded JSON request reader rejects malformed input", async () => {
  const request = new Request("https://example.test/api", { method: "POST", body: "{" });
  await assert.rejects(readJsonBody(request), ValidationError);
});

test("bounded JSON request reader cancels chunked input over its limit", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(JSON_REQUEST_BODY_MAX_BYTES));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { cancelled = true; },
  });
  const init = { method: "POST", body, duplex: "half" } as RequestInit & { duplex: "half" };
  await assert.rejects(readJsonBody(new Request("https://example.test/api", init)), ValidationError);
  assert.equal(cancelled, true);
});

test("bounded JSON request reader rejects oversized declared bodies immediately", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-length": String(JSON_REQUEST_BODY_MAX_BYTES + 1) },
    body: "{}",
  });
  await assert.rejects(readJsonBody(request), ValidationError);
});
