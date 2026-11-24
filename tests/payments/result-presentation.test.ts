import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentResultDestinations, paymentResultState } from "../../src/lib/payments/cashfree/result-presentation";

test("confirmation page only shows success or failure for server terminal states", () => {
  assert.equal(paymentResultState({ orderStatus: "paid", paymentStatus: "paid" }), "success");
  assert.equal(paymentResultState({ orderStatus: "expired", paymentStatus: "failed" }), "failed");
  assert.equal(paymentResultState({ orderStatus: "awaiting_payment", paymentStatus: "pending" }), "processing");
  assert.equal(paymentResultState({ orderStatus: "awaiting_payment", paymentStatus: "failed" }), "processing");
});

test("result actions cover PDFs, consultations and mixed purchases", () => {
  assert.deepEqual(paymentResultDestinations([{ productType: "pdf_bundle" }]), { library: true, bookings: false });
  assert.deepEqual(paymentResultDestinations([{ productType: "call_guidance" }]), { library: false, bookings: true });
  assert.deepEqual(paymentResultDestinations([{ productType: "pdf" }, { productType: "call_guidance" }]), { library: true, bookings: true });
});
