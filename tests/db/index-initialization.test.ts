import assert from "node:assert/strict";
import { CheckoutClaimModel } from "../../src/lib/db/models/checkout-claim";
import { PurchaseModel } from "../../src/lib/db/models/fulfillment";
import { test } from "node:test";
import {
  assertConfirmedDatabaseName,
  formatIndexFailure,
  IndexInitializationFailure,
  IndexInitializationUsageError,
  legacyOrderNumberIndexName,
  inspectPurchaseIndexes,
  classifyMissingOrderLineRows,
  isApprovedLegacyPurchaseIndex,
  parseIndexInitializationArgs,
  shouldDropLegacyRefundIndex,
  compareManagedIndexes,
  managedModels,
  emailTestRateIndexDefinition,
} from "../../scripts/initialize-indexes";

test("managed inventory includes review and support collections", () => {
  const names = managedModels.map((model) => model.collection.collectionName);
  for (const name of ["reviews", "supportRequests", "supportRates", "purchases", "checkoutClaims", "outboxEvents"]) assert.ok(names.includes(name));
  assert.equal(new Set(names).size, names.length);
});

test("email test migration derives its unique rate index from the active model", () => {
  const index = emailTestRateIndexDefinition();
  assert.deepEqual(index.key, { identityHash: 1, windowStart: 1 });
  assert.equal(index.unique, true);
  assert.deepEqual(compareManagedIndexes([index], [index]), { missing: [], incompatible: [] });
  assert.deepEqual(compareManagedIndexes([index], [{ ...index, unique: false }]), { missing: [], incompatible: [index.name] });
});

test("index comparison detects missing names and incompatible security options", () => {
  const expected = [{ name: "active_claim", key: { userId: 1, productId: 1 }, unique: true, partialFilterExpression: { status: "active" } }];
  assert.deepEqual(compareManagedIndexes(expected, []), { missing: ["active_claim"], incompatible: [] });
  assert.deepEqual(compareManagedIndexes(expected, [{ name: "active_claim", key: { productId: 1, userId: 1 }, unique: true, partialFilterExpression: { status: "active" } }]), { missing: [], incompatible: ["active_claim"] });
  assert.deepEqual(compareManagedIndexes(expected, [{ name: "active_claim", key: { userId: 1, productId: 1 }, unique: false }]), { missing: [], incompatible: ["active_claim"] });
  assert.deepEqual(compareManagedIndexes(expected, expected), { missing: [], incompatible: [] });
  assert.deepEqual(compareManagedIndexes([{ key: { identityHash: 1, windowStart: 1 } }], [{ name: "identityHash_1_windowStart_1", key: { identityHash: 1, windowStart: 1 } }]), { missing: [], incompatible: [] });
});

test("index initialization requires the exact database name and keeps legacy-index removal explicit", () => {
  assert.deepEqual(parseIndexInitializationArgs(["--confirm-database", "moneytree_test"]), {
    databaseName: "moneytree_test", dropLegacyRefundIndex: false, dropLegacyOrderNumberIndex: false, claimsOnly: false, repurchaseIndexesOnly: false, preflightOnly: false,
  });
  assert.deepEqual(parseIndexInitializationArgs([
    "--confirm-database", "moneytree_test", "--drop-legacy-refund-index",
  ]), { databaseName: "moneytree_test", dropLegacyRefundIndex: true, dropLegacyOrderNumberIndex: false, claimsOnly: false, repurchaseIndexesOnly: false, preflightOnly: false });
  assert.deepEqual(parseIndexInitializationArgs([
    "--confirm-database", "moneytree_test", "--drop-legacy-order-number-index", "--confirm-non-production",
  ]), { databaseName: "moneytree_test", dropLegacyRefundIndex: false, dropLegacyOrderNumberIndex: true, claimsOnly: false, repurchaseIndexesOnly: false, preflightOnly: false });
  assert.deepEqual(parseIndexInitializationArgs(["--confirm-database", "moneytree_test", "--claims-only"]), { databaseName: "moneytree_test", dropLegacyRefundIndex: false, dropLegacyOrderNumberIndex: false, claimsOnly: true, repurchaseIndexesOnly: false, preflightOnly: false });
  assert.deepEqual(parseIndexInitializationArgs(["--confirm-database", "moneytree_test", "--repurchase-indexes-only", "--confirm-non-production"]), { databaseName: "moneytree_test", dropLegacyRefundIndex: false, dropLegacyOrderNumberIndex: false, claimsOnly: false, repurchaseIndexesOnly: true, preflightOnly: false });
  assert.equal(parseIndexInitializationArgs(["--confirm-database", "moneytree_test", "--repurchase-indexes-only", "--confirm-non-production", "--preflight-only"]).preflightOnly, true);
  assert.throws(() => parseIndexInitializationArgs(["--confirm-database", "moneytree_test", "--repurchase-indexes-only"]), IndexInitializationUsageError);
  assert.throws(() => parseIndexInitializationArgs([]), IndexInitializationUsageError);
  assert.throws(() => parseIndexInitializationArgs(["--confirm-database", "prod/other"]), IndexInitializationUsageError);
  assert.throws(() => parseIndexInitializationArgs(["--confirm-database", "moneytree_test", "--drop-all"]), IndexInitializationUsageError);
  assert.throws(() => parseIndexInitializationArgs(["--confirm-database", "moneytree_test", "--drop-legacy-order-number-index"]), IndexInitializationUsageError);
});

test("only the exact obsolete unique orderNumber index can be explicitly removed", () => {
  const obsolete = { name: "orderNumber_1", key: { orderNumber: 1 }, unique: true };
  assert.throws(() => legacyOrderNumberIndexName([obsolete], false), IndexInitializationUsageError);
  assert.equal(legacyOrderNumberIndexName([obsolete], true), "orderNumber_1");
  assert.equal(legacyOrderNumberIndexName([{ name: "orderNumber_desc", key: { orderNumber: -1 }, unique: true }], true), "orderNumber_desc");
  assert.equal(legacyOrderNumberIndexName([{ name: "orderReference_1", key: { orderReference: 1 }, unique: true }], true), null);
  assert.equal(legacyOrderNumberIndexName([{ name: "orderNumber_1", key: { orderNumber: 1 }, unique: true, partialFilterExpression: { orderNumber: { $exists: true } } }], true), null);
  assert.equal(legacyOrderNumberIndexName([{ name: "orderNumber_1", key: { orderNumber: 1 }, unique: false }], true), null);
  assert.equal(legacyOrderNumberIndexName([{ name: "orderNumber_1", key: { orderNumber: 1 }, unique: true, sparse: true }], true), null);
  assert.equal(legacyOrderNumberIndexName([{ name: "orderNumber_user", key: { orderNumber: 1, userId: 1 }, unique: true }], true), null);
});

test("index initialization refuses a database-name mismatch before applying indexes", () => {
  assert.doesNotThrow(() => assertConfirmedDatabaseName("moneytree_test", "moneytree_test"));
  assert.throws(() => assertConfirmedDatabaseName("moneytree_production", "moneytree_test"), IndexInitializationUsageError);
});

test("legacy refund-index removal requires its dedicated destructive flag", () => {
  assert.equal(shouldDropLegacyRefundIndex(false, false), false);
  assert.throws(() => shouldDropLegacyRefundIndex(true, false), IndexInitializationUsageError);
  assert.equal(shouldDropLegacyRefundIndex(true, true), true);
});


test("index failure diagnostics include safe stage and code without raw duplicate values", () => {
  const message = formatIndexFailure(new IndexInitializationFailure("create_indexes", "categories", ["category_slug_unique"], "MongoServerError", 11000, "DuplicateKey"));
  assert.deepEqual(JSON.parse(message), { stage: "create_indexes", collection: "categories", expectedIndexes: ["category_slug_unique"], errorName: "MongoServerError", errorCode: 11000, errorCodeName: "DuplicateKey" });
  assert.doesNotMatch(message, /secret|dup key|customer/i);
});


test("checkout claim schema declares the required active unique index", () => {
  assert.equal(CheckoutClaimModel.collection.collectionName, "checkoutClaims");
  const index = CheckoutClaimModel.schema.indexes().find(([, options]) => options.name === "checkout_claim_one_active_product");
  assert.deepEqual(index?.[0], { userId: 1, productId: 1 });
  assert.equal(index?.[1].unique, true);
  assert.deepEqual(index?.[1].partialFilterExpression, { status: "active" });
});

test("repurchases retain unique order lines and use nonunique purchase history", () => {
  const indexes = PurchaseModel.schema.indexes();
  const line = indexes.find(([, options]) => options.name === "purchase_order_line_unique");
  const history = indexes.find(([, options]) => options.name === "purchase_user_product_history");
  assert.deepEqual(line?.[0], { orderLineId: 1 });
  assert.equal(line?.[1].unique, true);
  assert.deepEqual(history?.[0], { userId: 1, productId: 1, grantedAt: -1 });
  assert.notEqual(history?.[1].unique, true);
  assert.equal(indexes.some(([, options]) => options.name === "purchase_one_active_product_per_user"), false);
});

test("read-only preflight classifies missing, incompatible, and legacy indexes", () => {
  const result = inspectPurchaseIndexes([
    { name: "purchase_order_line_unique", key: { orderLineId: 1 }, unique: true },
    { name: "purchase_one_active_product_per_user", key: { userId: 1, productId: 1 }, unique: true, partialFilterExpression: { accessStatus: "active" } },
  ]);
  assert.deepEqual(result.missing, ["purchase_user_product_history"]);
  assert.equal(result.legacyPresent, true);
  const incompatible = inspectPurchaseIndexes([{ name: "purchase_user_product_history", key: { userId: 1, productId: 1 }, unique: true }]);
  assert.deepEqual(incompatible.incompatible, ["purchase_user_product_history"]);
  assert.deepEqual(incompatible.missing, ["purchase_order_line_unique"]);
});

test("one preserved legacy purchase may use the unique single-field orderLineId index", () => {
  assert.deepEqual(classifyMissingOrderLineRows([{ user: "legacy", product: "legacy" }]), { allowedLegacyMissing: 1, unsafeMissing: 0 });
  assert.deepEqual(classifyMissingOrderLineRows([{ user: "legacy", product: "legacy" }, { user: "legacy2", product: "legacy2" }]), { allowedLegacyMissing: 0, unsafeMissing: 2 });
  assert.deepEqual(classifyMissingOrderLineRows([{ userId: "modern", productId: "modern" }]), { allowedLegacyMissing: 0, unsafeMissing: 1 });
});

test("actual historical unique user/product index is recognized exactly", () => {
  assert.equal(isApprovedLegacyPurchaseIndex({ name: "user_1_product_1", key: { user: 1, product: 1 }, unique: true }), true);
  assert.equal(isApprovedLegacyPurchaseIndex({ name: "some_other_index", key: { user: 1, product: 1 }, unique: true }), false);
});
