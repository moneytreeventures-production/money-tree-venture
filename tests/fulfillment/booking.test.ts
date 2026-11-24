import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictError } from "../../src/lib/errors/app-error";
import { assertBookingTransition, bookingEntitlementFilter, verifiedBookingPaymentFilter } from "../../src/lib/fulfillment/booking-policy";
import { adminBookingUpdateSchema, customerAvailabilitySchema } from "../../src/lib/fulfillment/booking-validation";
import { toCustomerBookingView } from "../../src/lib/fulfillment/booking-service";
import { Types } from "mongoose";
import type { Booking } from "../../src/lib/db/models";

test("booking transition policy prevents reopening completed or cancelled calls", () => {
  assert.doesNotThrow(() => assertBookingTransition("awaiting_scheduling", "scheduled"));
  assert.doesNotThrow(() => assertBookingTransition("scheduled", "confirmed"));
  assert.doesNotThrow(() => assertBookingTransition("confirmed", "completed"));
  assert.throws(() => assertBookingTransition("scheduled", "completed"), ConflictError);
  assert.throws(() => assertBookingTransition("awaiting_scheduling", "completed"), ConflictError);
  assert.throws(() => assertBookingTransition("completed", "scheduled"), ConflictError);
  assert.throws(() => assertBookingTransition("cancelled", "scheduled"), ConflictError);
});

test("booking entitlement must match owner, order, product, Call Guidance type, and active status", () => {
  const purchaseId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const productId = new Types.ObjectId();
  assert.deepEqual(bookingEntitlementFilter({ purchaseId, userId, orderId, productId }), {
    _id: purchaseId, userId, orderId, productId,
    productType: "call_guidance", entitlementType: "booking", accessStatus: "active",
  });
});

test("customer booking view omits private administrator notes", () => {
  const view = toCustomerBookingView({
    _id: new Types.ObjectId(), bookingReference: "MTVB-TEST", userId: new Types.ObjectId(),
    orderId: new Types.ObjectId(), purchaseId: new Types.ObjectId(), productId: new Types.ObjectId(),
    status: "awaiting_scheduling", requestedSlots: [], sessionDurationMinutes: 30,
    schedulingInstructions: "Share your available times.", adminNotes: "Internal follow-up note.",
  } as Booking & { _id: Types.ObjectId });
  assert.equal("adminNotes" in view, false);
  assert.equal(view.status, "awaiting_scheduling");
});

test("customer availability requires valid timezone, unique future-formatted instants, and bounded slots", () => {
  const valid = customerAvailabilitySchema.parse({
    timezone: "Asia/Kolkata", requestedStartsAt: ["2026-12-01T10:00:00+05:30"], customerNotes: "Prefer morning.",
  });
  assert.equal(valid.timezone, "Asia/Kolkata");
  assert.equal(customerAvailabilitySchema.safeParse({ timezone: "Not/AZone", requestedStartsAt: ["2026-12-01T10:00:00Z"] }).success, false);
  assert.equal(customerAvailabilitySchema.safeParse({ timezone: "UTC", requestedStartsAt: ["2026-12-01T10:00:00Z", "2026-12-01T10:00:00Z"] }).success, false);
  assert.equal(customerAvailabilitySchema.safeParse({ timezone: "UTC", requestedStartsAt: ["2026-12-01T10:00:00+05:30", "2026-12-01T04:30:00Z"] }).success, false);
  assert.equal(customerAvailabilitySchema.safeParse({ timezone: "UTC", requestedStartsAt: [] }).success, false);
});

test("admin booking updates require schedule and cancellation fields", () => {
  assert.equal(adminBookingUpdateSchema.safeParse({ status: "scheduled" }).success, false);
  assert.equal(adminBookingUpdateSchema.safeParse({ status: "cancelled" }).success, false);
  assert.equal(adminBookingUpdateSchema.safeParse({ status: "scheduled", scheduledStartAt: "2026-12-01T10:00:00Z", timezone: "UTC" }).success, true);
  assert.equal(adminBookingUpdateSchema.safeParse({ status: "cancelled", cancellationReason: "Customer requested cancellation." }).success, true);
  assert.equal(adminBookingUpdateSchema.safeParse({ status: "confirmed" }).success, true);
  assert.equal(adminBookingUpdateSchema.safeParse({ status: "completed", scheduledStartAt: "2026-12-01T10:00:00Z", timezone: "UTC" }).success, false);
  assert.equal(adminBookingUpdateSchema.safeParse({ status: "scheduled", scheduledStartAt: "2026-12-01T10:00:00Z", timezone: "UTC", cancellationReason: "No" }).success, false);
});


test("booking payment evidence is bound to customer, order, amount and Cashfree success", () => {
  const userId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  assert.deepEqual(verifiedBookingPaymentFilter({ userId, orderId, amountPaise: 19900, gatewayEnvironment: "sandbox" }), {
    userId, orderId, amountPaise: 19900, gatewayEnvironment: "sandbox", status: "success", providerStatus: "SUCCESS", currency: "INR", cashfreeOrderId: { $type: "string" }, cashfreePaymentId: { $type: "string" },
  });
});
