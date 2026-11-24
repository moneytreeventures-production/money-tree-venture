import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import mongoose, { Types } from "mongoose";
import {
  AuditLogModel,
  OrderModel,
  OutboxEventModel,
  PaymentModel,
  PurchaseModel,
  RefundModel,
  UserModel,
} from "../../src/lib/db/models";
import { connectToDatabase } from "../../src/lib/db/mongodb";
import { requestFullCashfreeRefund } from "../../src/lib/payments/cashfree/refund-service";
import type { CashfreeGateway, CashfreeRefundResult } from "../../src/lib/payments/cashfree/client";

const testUri = process.env.MONGODB_TEST_URI;

test("Cashfree refund failure can be retried and confirmed transactionally", { skip: testUri ? false : "Set MONGODB_TEST_URI to a dedicated replica-set test cluster." }, async (t) => {
  if (!testUri) return;
  const databaseName = `moneytree_test_${randomUUID().replaceAll("-", "")}`;
  const environmentKeys = [
    "MONGODB_URI", "MONGODB_DB_NAME", "CASHFREE_CLIENT_ID", "CASHFREE_CLIENT_SECRET",
    "CASHFREE_ENVIRONMENT", "CASHFREE_API_VERSION", "CASHFREE_WEBHOOK_VERSION", "CASHFREE_RETURN_URL_BASE",
  ] as const;
  const previousEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    MONGODB_URI: testUri,
    MONGODB_DB_NAME: databaseName,
    CASHFREE_CLIENT_ID: "integration-test-client",
    CASHFREE_CLIENT_SECRET: "integration-test-secret-never-used-for-network-calls",
    CASHFREE_ENVIRONMENT: "sandbox",
    CASHFREE_API_VERSION: "2026-01-01",
    CASHFREE_WEBHOOK_VERSION: "2025-01-01",
    CASHFREE_RETURN_URL_BASE: "http://localhost:3000/checkout/return",
  });
  t.after(async () => {
    try {
      if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  await connectToDatabase();
  await Promise.all([
    UserModel.createIndexes(), OrderModel.createIndexes(), PaymentModel.createIndexes(),
    PurchaseModel.createIndexes(), RefundModel.createIndexes(), AuditLogModel.createIndexes(), OutboxEventModel.createIndexes(),
  ]);

  const [customer] = await UserModel.create([{
    authUserId: `integration-customer-${randomUUID()}`, name: "Integration Buyer",
    email: "integration-buyer@example.test", emailNormalized: "integration-buyer@example.test",
  }]);
  const [admin] = await UserModel.create([{
    authUserId: `integration-admin-${randomUUID()}`, name: "Integration Admin",
    email: "integration-admin@example.test", emailNormalized: "integration-admin@example.test", role: "admin",
  }]);
  assert.ok(customer && admin);

  const productId = new Types.ObjectId();
  const [order] = await OrderModel.create([{
    orderReference: `MTV-TEST-${randomUUID().slice(0, 12)}`, userId: customer._id,
    gatewayEnvironment: "sandbox", customerSnapshot: { name: customer.name, email: customer.email },
    lines: [{
      productId, productName: "Integration PDF", productSlug: "integration-pdf", productType: "pdf", quantity: 1,
      unitPricePaise: 1_000, lineSubtotalPaise: 1_000, discountPaise: 0, taxPaise: 0, lineTotalPaise: 1_000,
      asset: { assetId: new Types.ObjectId(), version: "v1" }, includedProducts: [],
    }],
    subtotalPaise: 1_000, discountPaise: 0, taxPaise: 0, totalPaise: 1_000, currency: "INR",
    taxSnapshot: { rateBasisPoints: 0, calculationVersion: "integration-test" },
    orderStatus: "paid", paymentStatus: "paid", paidAt: new Date(),
  }]);
  assert.ok(order);
  const orderLineId = order.lines[0]?._id;
  assert.ok(orderLineId);
  const [payment] = await PaymentModel.create([{
    paymentReference: `PAY-${randomUUID()}`, orderId: order._id, userId: customer._id,
    gatewayEnvironment: "sandbox", cashfreeOrderId: `MTVP-${randomUUID().replaceAll("-", "")}`,
    cashfreePaymentId: `cf-payment-${randomUUID()}`, amountPaise: 1_000, currency: "INR", status: "success", paidAt: new Date(),
  }]);
  assert.ok(payment);
  await PurchaseModel.create([{
    userId: customer._id, orderId: order._id, orderLineId, productId,
    productType: "pdf", entitlementType: "download", accessStatus: "active",
  }]);

  const providerRefunds = new Map<string, CashfreeRefundResult>();
  let refundAttempt = 0;
  const gateway: CashfreeGateway = {
    async createOrder() { throw new Error("Unexpected order request in refund integration test."); },
    async fetchOrder() { throw new Error("Unexpected order lookup in refund integration test."); },
    async fetchPayments() { throw new Error("Unexpected payment-list request in refund integration test."); },
    async fetchPayment() { throw new Error("Unexpected payment lookup in refund integration test."); },
    async createRefund(input) {
      refundAttempt += 1;
      const result: CashfreeRefundResult = {
        orderId: input.orderId, paymentId: payment.cashfreePaymentId!, refundId: input.refundId,
        providerRefundId: `cf-refund-${refundAttempt}`, amountPaise: input.amountPaise, currency: "INR",
        status: refundAttempt === 1 ? "PENDING" : refundAttempt === 2 ? "FAILED" : "SUCCESS",
      };
      providerRefunds.set(input.refundId, result);
      return result;
    },
    async fetchRefund(_cashfreeOrderId, refundId) {
      const result = providerRefunds.get(refundId);
      if (!result) throw new Error("Unknown fake refund ID.");
      return result;
    },
  };

  const firstAttempt = await requestFullCashfreeRefund(order._id.toString(), admin._id.toString(), { reason: "Initial attempt" }, gateway);
  assert.equal(firstAttempt.status, "pending");
  assert.equal((await OrderModel.findById(order._id).lean().exec())?.orderStatus, "partially_refunded");
  assert.equal((await PurchaseModel.findOne({ orderId: order._id }).lean().exec())?.accessStatus, "active");

  const failedAttempt = await requestFullCashfreeRefund(order._id.toString(), admin._id.toString(), { reason: "Check pending refund" }, gateway);
  assert.equal(failedAttempt.status, "failed");
  assert.equal(failedAttempt.refundId, firstAttempt.refundId);
  assert.equal((await OrderModel.findById(order._id).lean().exec())?.orderStatus, "paid");
  assert.equal((await PurchaseModel.findOne({ orderId: order._id }).lean().exec())?.accessStatus, "active");

  const retry = await requestFullCashfreeRefund(order._id.toString(), admin._id.toString(), { reason: "Retry after provider failure" }, gateway);
  assert.equal(retry.status, "success");
  assert.notEqual(retry.refundId, failedAttempt.refundId);
  assert.equal(refundAttempt, 3);
  assert.equal((await OrderModel.findById(order._id).lean().exec())?.orderStatus, "refunded");
  assert.equal((await PurchaseModel.findOne({ orderId: order._id }).lean().exec())?.accessStatus, "revoked");
  assert.equal(await RefundModel.countDocuments({ orderId: order._id }), 2);
  assert.equal(await OutboxEventModel.countDocuments({ eventType: "refund_confirmation", aggregateId: order._id }), 1);
  assert.equal(await AuditLogModel.countDocuments({ action: "refund.requested" }), 2);
});
