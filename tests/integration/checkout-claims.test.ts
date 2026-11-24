import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { CheckoutClaimModel } from "../../src/lib/db/models/checkout-claim";
import { PurchaseModel } from "../../src/lib/db/models/fulfillment";

const uri = process.env.MONGODB_TEST_URI;
test("unique active claim permits only one overlapping checkout in disposable MongoDB", { skip: !uri && "MONGODB_TEST_URI replica set required" }, async () => {
  if (!uri) return;
  const dbName = `moneytree_claims_${randomUUID().replaceAll("-", "")}`;
  await mongoose.connect(uri, { dbName, autoIndex: false });
  try {
    assert.equal(mongoose.connection.name, dbName);
    await CheckoutClaimModel.createIndexes();
    const userId = new Types.ObjectId();
    const shared = new Types.ObjectId();
    const first = new Types.ObjectId();
    const second = new Types.ObjectId();
    const orders = [new Types.ObjectId(), new Types.ObjectId()];
    const settle = async (orderId: Types.ObjectId, products: Types.ObjectId[]) => {
      const session = await mongoose.startSession();
      try { await session.withTransaction(async () => {
        await CheckoutClaimModel.create(products.map((productId) => ({ userId, productId, orderId, status: "active" })), { session });
      }); return true; } catch { return false; } finally { await session.endSession(); }
    };
    const results = await Promise.all([settle(orders[0]!, [first, shared]), settle(orders[1]!, [shared, second])]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await CheckoutClaimModel.countDocuments({ userId, productId: shared, status: "active" }), 1);
    assert.equal(await CheckoutClaimModel.countDocuments({ userId, status: "active" }), 2);
  } finally {
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("completed payment permits a new claim and refund of one order preserves the other purchase", { skip: !uri && "MONGODB_TEST_URI replica set required" }, async () => {
  if (!uri) return;
  const dbName = `moneytree_repurchase_${randomUUID().replaceAll("-", "")}`;
  await mongoose.connect(uri, { dbName, autoIndex: false });
  try {
    assert.equal(mongoose.connection.name, dbName);
    await CheckoutClaimModel.createIndexes();
    await PurchaseModel.createIndexes();
    const userId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    const firstOrderId = new Types.ObjectId();
    const secondOrderId = new Types.ObjectId();
    await CheckoutClaimModel.create({ userId, productId, orderId: firstOrderId, status: "active" });
    await assert.rejects(CheckoutClaimModel.create({ userId, productId, orderId: secondOrderId, status: "active" }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === 11000);
    await CheckoutClaimModel.updateOne({ userId, productId, orderId: firstOrderId, status: "active" }, { $set: { status: "completed", completedAt: new Date() } });
    await CheckoutClaimModel.create({ userId, productId, orderId: secondOrderId, status: "active" });
    const firstLineId = new Types.ObjectId();
    const secondLineId = new Types.ObjectId();
    await PurchaseModel.create([
      { userId, productId, orderId: firstOrderId, orderLineId: firstLineId, productType: "pdf", entitlementType: "download", bundleItems: [], accessStatus: "active", grantedAt: new Date() },
      { userId, productId, orderId: secondOrderId, orderLineId: secondLineId, productType: "pdf", entitlementType: "download", bundleItems: [], accessStatus: "active", grantedAt: new Date() },
    ]);
    await assert.rejects(PurchaseModel.create({ userId, productId, orderId: secondOrderId, orderLineId: secondLineId, productType: "pdf", entitlementType: "download", bundleItems: [], accessStatus: "active", grantedAt: new Date() }), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === 11000);
    await PurchaseModel.updateOne({ orderId: firstOrderId, userId, accessStatus: "active" }, { $set: { accessStatus: "revoked", revokedAt: new Date(), revocationReason: "Disposable refund fixture" } });
    assert.equal(await PurchaseModel.countDocuments({ userId, productId, accessStatus: "active" }), 1);
    assert.equal((await PurchaseModel.findOne({ orderId: secondOrderId, productId }).lean().exec())?.accessStatus, "active");
  } finally {
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
