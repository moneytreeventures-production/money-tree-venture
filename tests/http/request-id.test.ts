import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequestId, isValidRequestId, resolveRequestId } from "../../src/lib/http/request-id";
import { createJsonResponse } from "../../src/lib/http/response";

function requestWithId(value?: string): Request {
  const headers = new Headers();
  if (value !== undefined) headers.set("x-request-id", value);
  return new Request("https://moneytreeventure.test/api/example", { headers });
}

test("valid IDs are accepted only from a trusted overwritten header", () => {
  const request = requestWithId("edge-req-123456");
  assert.equal(resolveRequestId(request, { trustIncomingHeader: true }), "edge-req-123456");
  assert.notEqual(resolveRequestId(request), "edge-req-123456");
});

test("invalid and oversized IDs are replaced with generated IDs", () => {
  const invalid = resolveRequestId(requestWithId("bad-id"), { trustIncomingHeader: true });
  const oversized = resolveRequestId(requestWithId("x".repeat(100)), { trustIncomingHeader: true });
  assert.ok(isValidRequestId(invalid));
  assert.ok(isValidRequestId(oversized));
  assert.notEqual(invalid, "bad-id");
  assert.equal(isValidRequestId("bad\r\nid"), false);
});

test("generated IDs have a bounded UUID-compatible format", () => {
  const id = createRequestId();
  assert.ok(isValidRequestId(id));
  assert.equal(id.length, 36);
});

test("concurrent requests receive isolated request IDs without mutable global state", async () => {
  const ids = await Promise.all(Array.from({ length: 32 }, async () => resolveRequestId(requestWithId("untrusted-client-id"))));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(isValidRequestId));
});

test("JSON responses preserve status and include the validated request-ID header", async () => {
  const response = createJsonResponse({ success: true, data: "ready" }, "success-123456", { status: 201, headers: { "content-language": "hi" } });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-request-id"), "success-123456");
  assert.equal(response.headers.get("content-language"), "hi");
  assert.deepEqual(await response.json(), { success: true, data: "ready" });
});
