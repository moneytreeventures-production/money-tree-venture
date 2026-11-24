import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "../../src/lib/db/mongodb";
import { maintainOrders } from "../../src/lib/checkout/order-maintenance";

const uri = process.env.MONGODB_TEST_URI;
test("live permanent order purge is disabled before opening a database connection", async () => {
  await assert.rejects(maintainOrders({ mode: "purge", database: "disposable", dryRun: false, limit: 1 }), /deletion is disabled/i);
});
test("disposable retention preview preserves records and live purge remains disabled", { skip: !uri && "MONGODB_TEST_URI replica set required" }, async () => {
  if (!uri) return;
  const db = `moneytree_cleanup_${randomUUID().replaceAll("-", "")}`;
  const oldUri = process.env.MONGODB_URI;
  const oldDb = process.env.MONGODB_DB_NAME;
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB_NAME = db;
  try {
    await connectToDatabase();
    assert.equal(mongoose.connection.name, db);
    const orders = mongoose.connection.collection("orders");
    const audits = mongoose.connection.collection("auditLogs");
    const old = new Date("2025-01-01");
    const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    for (const [i, id] of ids.entries()) {
      await orders.insertOne({ _id: id, userId: new Types.ObjectId(), gatewayEnvironment: "sandbox", orderStatus: i === 0 ? "paid" : "expired", paymentStatus: i === 0 ? "paid" : "unpaid", updatedAt: old, createdAt: old });
      await audits.insertOne({ actorType: "system", action: "order.payment_window_expired", targetType: "order", targetId: id.toString(), changedFields: [], createdAt: old });
    }
    const dry = await maintainOrders({ mode: "purge", database: db, dryRun: true, limit: 1 });
    assert.equal(dry.processed, 0);
    assert.equal(await orders.countDocuments(), 3);
    await assert.rejects(maintainOrders({ mode: "purge", database: db, dryRun: false, limit: 1 }), /deletion is disabled/i);
    assert.equal(await orders.countDocuments(), 3);
    assert.ok(await orders.findOne({ _id: ids[0] }));
    assert.equal(await audits.countDocuments({ action: "order.abandoned_purged" }), 0);
  } finally {
    if (mongoose.connection.name === db) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (oldUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = oldUri;
    if (oldDb === undefined) delete process.env.MONGODB_DB_NAME; else process.env.MONGODB_DB_NAME = oldDb;
  }
});
