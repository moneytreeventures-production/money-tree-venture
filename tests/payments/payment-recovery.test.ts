import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyPaymentRecovery } from "../../src/lib/payments/cashfree/recovery-plan";

const attempt = (status: string, identityMatches = true, amountMatches = true) => ({ status, identityMatches, amountMatches });
const providerOrder = (status: string, paymentStatuses: ReturnType<typeof attempt>[], identityMatches = true, amountMatches = true) =>
  ({ status, paymentStatuses, identityMatches, amountMatches });

test("read-only recovery classifies a verified paid order even after an earlier failed attempt", () => {
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "pending", providerOrders: [
    providerOrder("PAID", [attempt("FAILED"), attempt("SUCCESS")]),
  ] }), "verified_success_candidate");
});

test("already paid order is classified as settled without requesting another mutation", () => {
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "paid", providerOrders: [
    providerOrder("PAID", [attempt("SUCCESS")]),
  ] }), "already_paid");
});

test("a failed attempt is a candidate for existing reconciliation, not proof the order should be cancelled", () => {
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "pending", providerOrders: [providerOrder("ACTIVE", [attempt("FAILED")])] }), "failed_attempt_candidate");
});

test("pending attempts and active orders stay unresolved", () => {
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "pending", providerOrders: [providerOrder("ACTIVE", [attempt("PENDING")])] }), "unresolved");
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "pending", providerOrders: [providerOrder("ACTIVE", [])] }), "unresolved");
});

test("mismatched payment order or amount prevents a verified recovery classification", () => {
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "pending", providerOrders: [providerOrder("PAID", [attempt("SUCCESS", false)])] }), "mismatch_or_review");
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "pending", providerOrders: [providerOrder("PAID", [attempt("SUCCESS", true, false)])] }), "mismatch_or_review");
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "pending", providerOrders: [providerOrder("PAID", [attempt("SUCCESS")], false)] }), "mismatch_or_review");
});

test("a provider order without a successful attempt is never classified as paid", () => {
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "pending", providerOrders: [providerOrder("PAID", [])] }), "unresolved");
  assert.equal(classifyPaymentRecovery({ localPaymentStatus: "pending", providerOrders: [] }), "no_provider_order");
});
