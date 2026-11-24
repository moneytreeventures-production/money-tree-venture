import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyCustomerPaymentStatus, startPaymentStatusPolling, type PaymentStatusCheckResult } from "../../src/lib/payments/cashfree/status-polling";

test("only a final expired failure or verified paid state stops customer polling", () => {
  assert.equal(classifyCustomerPaymentStatus("awaiting_payment", "pending"), "pending");
  assert.equal(classifyCustomerPaymentStatus("awaiting_payment", "failed"), "pending");
  assert.equal(classifyCustomerPaymentStatus("expired", "failed"), "failed");
  assert.equal(classifyCustomerPaymentStatus("paid", "paid"), "paid");
  assert.equal(classifyCustomerPaymentStatus("awaiting_payment", "paid"), "unknown");
});

function fakeDocument(hidden = false) {
  const listeners = new Set<() => void>();
  return {
    hidden,
    addEventListener(_name: string, listener: () => void) { listeners.add(listener); },
    removeEventListener(_name: string, listener: () => void) { listeners.delete(listener); },
    show() { this.hidden = false; for (const listener of listeners) listener(); },
    hide() { this.hidden = true; for (const listener of listeners) listener(); },
    listenerCount() { return listeners.size; },
  };
}

async function withDocument(run: (page: ReturnType<typeof fakeDocument>) => Promise<void>, hidden = false) {
  const original = globalThis.document;
  const page = fakeDocument(hidden);
  globalThis.document = page as unknown as Document;
  try { await run(page); } finally { globalThis.document = original; }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 15));
async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 250;
  while (!check() && Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, 2));
  assert.equal(check(), true);
}

test("automatic polling reaches paid and stops without a manual action", async () => withDocument(async () => {
  const statuses: PaymentStatusCheckResult[] = ["pending", "paid"];
  let calls = 0;
  const stop = startPaymentStatusPolling(["order"], async () => { calls++; return statuses.shift() ?? "unknown"; }, [0, 0, 0]);
  await flush();
  assert.equal(calls, 2);
  stop();
}));

test("conclusive failure stops, while transient errors stay bounded", async () => withDocument(async () => {
  let failedCalls = 0;
  const stopFailed = startPaymentStatusPolling(["failed"], async () => { failedCalls++; return "failed"; }, [0, 0, 0]);
  await flush();
  assert.equal(failedCalls, 1);
  stopFailed();
  let unknownCalls = 0;
  const stopUnknown = startPaymentStatusPolling(["unknown"], async () => { unknownCalls++; throw new Error("provider timeout"); }, [0, 0, 0]);
  await waitFor(() => unknownCalls === 3);
  assert.equal(unknownCalls, 3);
  stopUnknown();
}));

test("hidden tabs pause without spending retries and resume when visible", async () => withDocument(async (page) => {
  let calls = 0;
  const stop = startPaymentStatusPolling(["order"], async () => { calls++; return "paid"; }, [0, 0]);
  await flush();
  assert.equal(calls, 0);
  page.show();
  await flush();
  assert.equal(calls, 1);
  stop();
  assert.equal(page.listenerCount(), 0);
}, true));

test("unmount aborts an in-flight request and prevents later rounds", async () => withDocument(async (page) => {
  let calls = 0;
  let aborted = false;
  const stop = startPaymentStatusPolling(["order"], async (_id, signal) => {
    calls++;
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
    return "unknown";
  }, [0, 0]);
  await flush();
  stop();
  await flush();
  assert.equal(calls, 1);
  assert.equal(aborted, true);
  assert.equal(page.listenerCount(), 0);
}));

test("multiple visible orders are checked without concurrent duplicate requests", async () => withDocument(async () => {
  const calls: string[] = [];
  let active = 0;
  let peak = 0;
  const stop = startPaymentStatusPolling(["a", "b", "a"], async (id) => {
    active++;
    peak = Math.max(peak, active);
    calls.push(id);
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
    active--;
    return "paid";
  }, [0]);
  await flush();
  assert.deepEqual(calls, ["a", "b"]);
  assert.equal(peak, 1);
  stop();
}));
