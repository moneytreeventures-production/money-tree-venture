import assert from "node:assert/strict";
import { test } from "node:test";
import { decideExpiredFailureRecovery, type ExpiredFailureEvidence } from "../../src/lib/payments/cashfree/expired-failure-recovery-plan";
import { canFinalizeVerifiedExpiredOrder, canInitiatePaymentForOrder, isOwnerHeldHistoricalRecovery } from "../../src/lib/payments/cashfree/order-payment-state";

const now = new Date("2026-11-24T12:00:00.000Z");
const failed = { status: "FAILED", identityMatches: true, amountMatches: true };
const success = { status: "SUCCESS", identityMatches: true, amountMatches: true };
const pending = { status: "PENDING", identityMatches: true, amountMatches: true };
const base: ExpiredFailureEvidence = {
  localOrderStatus: "awaiting_payment", localPaymentStatus: "pending",
  localExpiresAt: new Date("2026-11-22T12:00:00.000Z"), activeClaims: 1, purchases: 0,
  providerOrders: [{ status: "EXPIRED", identityMatches: true, amountMatches: true, payments: [failed] }],
};

test("expired Cashfree order with one failed attempt permits the existing failed-then-expired lifecycle", () => {
  assert.equal(decideExpiredFailureRecovery(base, now), "eligible");
});

test("a previously synchronized failed attempt remains eligible for safe retry after interrupted expiration", () => {
  assert.equal(decideExpiredFailureRecovery({ ...base, localPaymentStatus: "failed" }, now), "eligible");
});

test("an already expired failed order with no claim is an idempotent no-op", () => {
  assert.equal(decideExpiredFailureRecovery({ ...base, localOrderStatus: "expired", localPaymentStatus: "failed", activeClaims: 0 }, now), "already_recovered");
  assert.equal(decideExpiredFailureRecovery({ ...base, localOrderStatus: "expired", localPaymentStatus: "failed", activeClaims: 0,
    providerOrders: [{ ...base.providerOrders[0], status: "PAID", payments: [success] }] }, now), "provider_success");
});

test("paid local order is never selected for failed-order recovery", () => {
  assert.equal(decideExpiredFailureRecovery({ ...base, localOrderStatus: "paid", localPaymentStatus: "paid" }, now), "local_state_changed");
});

test("any successful attempt takes precedence over failed evidence", () => {
  assert.equal(decideExpiredFailureRecovery({ ...base, providerOrders: [{ ...base.providerOrders[0], payments: [failed, success] }] }, now), "provider_success");
});

test("pending or unknown provider attempt blocks terminal order failure", () => {
  assert.equal(decideExpiredFailureRecovery({ ...base, providerOrders: [{ ...base.providerOrders[0], payments: [failed, pending] }] }, now), "provider_unresolved");
  assert.equal(decideExpiredFailureRecovery({ ...base, providerOrders: [{ ...base.providerOrders[0], payments: [] }] }, now), "provider_unresolved");
});

test("provider order must be expired and all identities and amounts must match", () => {
  assert.equal(decideExpiredFailureRecovery({ ...base, providerOrders: [{ ...base.providerOrders[0], status: "ACTIVE" }] }, now), "provider_not_expired");
  assert.equal(decideExpiredFailureRecovery({ ...base, providerOrders: [{ ...base.providerOrders[0], amountMatches: false }] }, now), "provider_mismatch");
  assert.equal(decideExpiredFailureRecovery({ ...base, providerOrders: [{ ...base.providerOrders[0], payments: [{ ...failed, identityMatches: false }] }] }, now), "provider_mismatch");
});

test("unexpected entitlement or claim count blocks recovery", () => {
  assert.equal(decideExpiredFailureRecovery({ ...base, purchases: 1 }, now), "unexpected_entitlement");
  assert.equal(decideExpiredFailureRecovery({ ...base, activeClaims: 0 }, now), "claim_count_changed");
});

test("local payment window must have expired independently of Cashfree", () => {
  assert.equal(decideExpiredFailureRecovery({ ...base, localExpiresAt: new Date("2026-11-25T12:00:00.000Z") }, now), "local_window_open");
});

test("an interrupted attempt without a real failed attempt needs review", () => {
  assert.equal(decideExpiredFailureRecovery({ ...base, providerOrders: [{ ...base.providerOrders[0], payments: [{ ...failed, status: "USER_DROPPED" }] }] }, now), "no_failed_attempt");
});

test("automatic finalization requires every provider order expired and every attempt resolved", () => {
  const expired = { status: "EXPIRED", identityMatches: true, amountMatches: true, payments: [failed] };
  assert.equal(canFinalizeVerifiedExpiredOrder([expired]), true);
  assert.equal(canFinalizeVerifiedExpiredOrder([expired, { ...expired, payments: [{ ...failed, status: "USER_DROPPED" }] }]), true);
  assert.equal(canFinalizeVerifiedExpiredOrder([expired, { ...expired, status: "ACTIVE" }]), false);
  assert.equal(canFinalizeVerifiedExpiredOrder([{ ...expired, payments: [failed, pending] }]), false);
  assert.equal(canFinalizeVerifiedExpiredOrder([{ ...expired, payments: [failed, success] }]), false);
  assert.equal(canFinalizeVerifiedExpiredOrder([{ ...expired, payments: [] }]), true);
  assert.equal(canFinalizeVerifiedExpiredOrder([{ ...expired, amountMatches: false }]), false);
  assert.equal(canFinalizeVerifiedExpiredOrder([{ ...expired, payments: [{ ...failed, identityMatches: false }] }]), false);
});

test("payment initiation never reuses a failed or expired order, while same pending attempt may be reused", () => {
  const expiresAt = new Date("2026-11-25T12:00:00.000Z");
  assert.equal(canInitiatePaymentForOrder({ orderStatus: "awaiting_payment", paymentStatus: "unpaid", expiresAt }, now), true);
  assert.equal(canInitiatePaymentForOrder({ orderStatus: "awaiting_payment", paymentStatus: "pending", expiresAt }, now), true);
  assert.equal(canInitiatePaymentForOrder({ orderStatus: "awaiting_payment", paymentStatus: "failed", expiresAt }, now), false);
  assert.equal(canInitiatePaymentForOrder({ orderStatus: "paid", paymentStatus: "paid", expiresAt }, now), false);
  assert.equal(canInitiatePaymentForOrder({ orderStatus: "expired", paymentStatus: "failed", expiresAt }, now), false);
  assert.equal(canInitiatePaymentForOrder({ orderStatus: "awaiting_payment", paymentStatus: "unpaid", expiresAt: new Date("2026-11-23T12:00:00.000Z") }, now), false);
});

test("the diagnosed historical order stays held for explicit owner approval only until recovery changes its state", () => {
  assert.equal(isOwnerHeldHistoricalRecovery("6b0341108ffd602387cde275", "awaiting_payment"), true);
  assert.equal(isOwnerHeldHistoricalRecovery("6b0341108ffd602387cde275", "expired"), false);
  assert.equal(isOwnerHeldHistoricalRecovery("6b04e305b88c9c755bce8429", "paid"), false);
});
