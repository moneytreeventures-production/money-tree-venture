import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { connectToDatabase } from "../src/lib/db/mongodb";
import {
  AuditLogModel,
  CheckoutClaimModel,
  BookingModel,
  CategoryModel,
  CouponModel,
  CouponRedemptionModel,
  DownloadLogModel,
  DownloadRateLimitModel,
  OrderModel,
  OutboxEventModel,
  PaymentModel,
  PersonalizedPdfModel,
  ProductAssetModel,
  ProductMediaModel,
  ProductModel,
  PurchaseModel,
  RefundModel,
  UserModel,
  WebhookEventModel,
} from "../src/lib/db/models";

const LEGACY_REFUND_INDEX = "refund_one_full_refund_per_order";
const LEGACY_ORDER_INDEX_FIELD = "orderNumber";

interface IndexableModel {
  collection: { collectionName: string };
  createIndexes(): Promise<unknown>;
}

export class IndexInitializationUsageError extends Error {}
export class IndexInitializationFailure extends Error {
  constructor(readonly stage: string, readonly collection: string, readonly expectedIndexes: string[], readonly errorName: string, readonly errorCode?: number, readonly errorCodeName?: string) {
    super("Index initialization failed.");
  }
}
function safeToken(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value) ? value : undefined;
}
export function formatIndexFailure(error: unknown): string {
  if (error instanceof IndexInitializationUsageError) return error.message;
  if (error instanceof IndexInitializationFailure) return JSON.stringify({
    stage: error.stage, collection: error.collection, expectedIndexes: error.expectedIndexes,
    errorName: error.errorName, errorCode: error.errorCode ?? null, errorCodeName: error.errorCodeName ?? null,
  });
  return JSON.stringify({ stage: "connection_or_preflight", errorName: safeToken((error as { name?: unknown })?.name) ?? "Error", errorCode: typeof (error as { code?: unknown })?.code === "number" ? (error as { code: number }).code : null });
}
async function createModelIndexes(model: IndexableModel & { schema?: { indexes(): Array<[Record<string, unknown>, { name?: string }]> } }): Promise<void> {
  try { await model.createIndexes(); }
  catch (error) {
    const source = error as { name?: unknown; code?: unknown; codeName?: unknown };
    throw new IndexInitializationFailure("create_indexes", model.collection.collectionName,
      model.schema?.indexes().map(([, options]) => options.name).filter((name): name is string => Boolean(name)) ?? [],
      safeToken(source?.name) ?? "Error", typeof source?.code === "number" ? source.code : undefined, safeToken(source?.codeName));
  }
}


export function parseIndexInitializationArgs(args: readonly string[]): { databaseName: string; dropLegacyRefundIndex: boolean; dropLegacyOrderNumberIndex: boolean; claimsOnly: boolean; repurchaseIndexesOnly: boolean; preflightOnly: boolean } {
  const validShape = (args.length === 2 || args.length === 3 || args.length === 4 || args.length === 5) && args[0] === "--confirm-database";
  const databaseName = args[1] ?? "";
  const validDatabaseName = /^[A-Za-z0-9_-]{1,64}$/.test(databaseName);
  const claimsOnly = args.length === 3 && args[2] === "--claims-only";
  const dropLegacyRefundIndex = args.length === 3 && args[2] === "--drop-legacy-refund-index";
  const dropLegacyOrderNumberIndex = args.length === 4 && args[2] === "--drop-legacy-order-number-index" && args[3] === "--confirm-non-production";
  const repurchaseIndexesOnly = args.includes("--repurchase-indexes-only") && args.includes("--confirm-non-production");
  const preflightOnly = repurchaseIndexesOnly && args.includes("--preflight-only");
  if (!validShape || !validDatabaseName || (args.length > 2 && !dropLegacyRefundIndex && !dropLegacyOrderNumberIndex && !claimsOnly && !repurchaseIndexesOnly) || (args.length === 5 && !preflightOnly)) {
    throw new IndexInitializationUsageError(
      "Usage: npm run db:indexes -- --confirm-database <exact-database-name> [--claims-only | --drop-legacy-refund-index | --drop-legacy-order-number-index --confirm-non-production | --repurchase-indexes-only --confirm-non-production]",
    );
  }
  if (preflightOnly && (args.length !== 5 || args[4] !== "--preflight-only")) throw new IndexInitializationUsageError("Preflight requires --repurchase-indexes-only --confirm-non-production --preflight-only in that order.");
  return { databaseName, dropLegacyRefundIndex, dropLegacyOrderNumberIndex, claimsOnly, repurchaseIndexesOnly, preflightOnly };
}

const LEGACY_PURCHASE_INDEX = "purchase_one_active_product_per_user";
const LEGACY_PURCHASE_INDEX_V1 = "user_1_product_1";
const PURCHASE_HISTORY_INDEX = "purchase_user_product_history";

export function inspectPurchaseIndexes(indexes: Array<{ name?: string; key: Record<string, unknown>; unique?: boolean; sparse?: boolean; partialFilterExpression?: unknown }>) {
  const byName = (name: string) => indexes.find((index) => index.name === name);
  const history = byName(PURCHASE_HISTORY_INDEX);
  const line = byName("purchase_order_line_unique");
  const legacyIndexes = indexes.filter((index) => index.unique === true && JSON.stringify(index.key) === JSON.stringify({ userId: 1, productId: 1 }) && JSON.stringify(index.partialFilterExpression) === JSON.stringify({ accessStatus: "active" }));
  const historicalLegacy = indexes.filter((index) => index.unique === true && JSON.stringify(index.key) === JSON.stringify({ user: 1, product: 1 }));
  const legacy = byName(LEGACY_PURCHASE_INDEX);
  const incompatible: string[] = [];
  if (history && (JSON.stringify(history.key) !== JSON.stringify({ userId: 1, productId: 1, grantedAt: -1 }) || history.unique === true || history.sparse === true || history.partialFilterExpression !== undefined)) incompatible.push(PURCHASE_HISTORY_INDEX);
  if (line && (JSON.stringify(line.key) !== JSON.stringify({ orderLineId: 1 }) || line.unique !== true || line.sparse === true || line.partialFilterExpression !== undefined)) incompatible.push("purchase_order_line_unique");
  if (legacy && (JSON.stringify(legacy.key) !== JSON.stringify({ userId: 1, productId: 1 }) || legacy.unique !== true || JSON.stringify(legacy.partialFilterExpression) !== JSON.stringify({ accessStatus: "active" }))) incompatible.push(LEGACY_PURCHASE_INDEX);
  return { missing: [!history && PURCHASE_HISTORY_INDEX, !line && "purchase_order_line_unique"].filter((name): name is string => Boolean(name)), incompatible, legacyPresent: Boolean(legacy || legacyIndexes.length || historicalLegacy.length), legacyIndexNames: [...new Set([...legacyIndexes, ...historicalLegacy].map((index) => index.name).filter((name): name is string => Boolean(name)))] };
}

export function classifyMissingOrderLineRows(rows: Array<{ orderLineId?: unknown; user?: unknown; product?: unknown; userId?: unknown; productId?: unknown; orderId?: unknown }>) {
  const allowed = rows.length === 1 && rows[0]?.user != null && rows[0]?.product != null && rows[0]?.userId == null && rows[0]?.productId == null && rows[0]?.orderId == null && rows[0]?.orderLineId == null;
  return { allowedLegacyMissing: allowed ? 1 : 0, unsafeMissing: allowed ? 0 : rows.length };
}

export function isApprovedLegacyPurchaseIndex(index: { name?: string; key: Record<string, unknown>; unique?: boolean; sparse?: boolean; partialFilterExpression?: unknown }): boolean {
  return index.name === LEGACY_PURCHASE_INDEX_V1 && index.unique === true && index.sparse !== true && JSON.stringify(index.key) === JSON.stringify({ user: 1, product: 1 }) && index.partialFilterExpression === undefined;
}

export async function preflightRepurchaseIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new IndexInitializationUsageError("MongoDB is not connected.");
  const collectionName = PurchaseModel.collection.collectionName;
  const exists = await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext();
  if (!exists) {
    console.info(JSON.stringify({ database: mongoose.connection.name, collection: collectionName, indexes: [], missing: [PURCHASE_HISTORY_INDEX, "purchase_order_line_unique"], incompatible: [], missingOrderLineIdCount: 0, duplicateOrderLineGroupCount: 0, checkoutReady: false, legacyRemovalRequired: false }));
    return;
  }
  const collection = db.collection(collectionName);
  const indexes = await collection.indexes();
  const inspection = inspectPurchaseIndexes(indexes);
  const [missingOrderLineIdCount, duplicateGroups] = inspection.missing.includes("purchase_order_line_unique") ? await Promise.all([
    collection.countDocuments({ $or: [{ orderLineId: { $exists: false } }, { orderLineId: null }] }),
    collection.aggregate([{ $match: { orderLineId: { $exists: true, $ne: null } } }, { $group: { _id: "$orderLineId", count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $count: "groups" }]).toArray(),
  ]) : [0, []];
  const missingRows = missingOrderLineIdCount ? await collection.aggregate([
    { $match: { $or: [{ orderLineId: { $exists: false } }, { orderLineId: null }] } },
    { $project: { _id: 1, user: 1, product: 1, userId: 1, productId: 1, orderId: 1, orderLineId: 1, accessStatus: 1 } },
    { $limit: 10 },
  ]).toArray() : [];
  const purchaseClassifications = await Promise.all(missingRows.map(async (purchase) => {
    const orderId = purchase.orderId;
    const order = orderId ? await db.collection("orders").findOne({ _id: orderId }, { projection: { lines: 1, userId: 1, orderStatus: 1, paymentStatus: 1 } }) : null;
    const lineMatches = order && Array.isArray(order.lines) ? order.lines.filter((line: { _id?: unknown; productId?: unknown }) => String(line.productId) === String(purchase.productId ?? purchase.product) && (!purchase.orderLineId || String(line._id) === String(purchase.orderLineId))) : [];
    const references = await Promise.all(["personalizedPdfs", "downloadLogs", "bookings"].map((name) => db.collection(name).countDocuments({ purchaseId: purchase._id })));
    return { sourceSchema: purchase.userId && purchase.productId ? "current_userId_productId" : purchase.user && purchase.product ? "legacy_user_product" : "unclassified", hasOrderReference: Boolean(order), orderLineMatchCount: lineMatches.length, orderPayment: order?.paymentStatus === "paid" && order?.orderStatus === "paid" ? "verified_paid_state" : order ? "not_verified_paid" : "no_order", entitlementStatus: purchase.accessStatus === "active" ? "active" : purchase.accessStatus === "revoked" ? "revoked" : "unknown", dependentReferenceCounts: { personalizedPdfs: references[0], downloadLogs: references[1], bookings: references[2] } };
  }));
  console.info(JSON.stringify({ database: mongoose.connection.name, collection: collectionName,
    indexes: indexes.map(({ name, key, unique, sparse, partialFilterExpression }) => ({ name, key, unique: unique === true, ...(sparse === true ? { sparse: true } : {}), ...(partialFilterExpression ? { partialFilterExpression } : {}) })),
    ...inspection, missingOrderLineIdCount, duplicateOrderLineGroupCount: duplicateGroups[0]?.groups ?? 0, purchaseClassifications,
    checkoutReady: inspection.missing.length === 0 && inspection.incompatible.length === 0 && !inspection.legacyPresent,
    legacyRemovalRequired: inspection.legacyPresent,
  }));
}

/** Guarded, resumable migration touching only purchases indexes. Never changes documents. */
export async function migrateRepurchaseIndexes(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new IndexInitializationUsageError("Repurchase index migration is disabled in production.");
  const db = mongoose.connection.db;
  if (!db) throw new IndexInitializationUsageError("MongoDB is not connected.");
  if (!await db.listCollections({ name: PurchaseModel.collection.collectionName }, { nameOnly: true }).hasNext()) {
    await createModelIndexes(PurchaseModel);
    console.info("Repurchase indexes verified for empty purchases collection; no documents changed.");
    return;
  }
  const collection = db.collection(PurchaseModel.collection.collectionName);
  const indexes = await collection.indexes();
  const byName = (name: string) => indexes.find((index) => index.name === name);
  if (indexes.some((index) => index.name !== LEGACY_PURCHASE_INDEX && index.unique === true &&
    JSON.stringify(index.key) === JSON.stringify({ userId: 1, productId: 1 }))) {
    throw new IndexInitializationUsageError("Another unique customer-product purchase index exists. No index was removed.");
  }
  const orderLine = byName("purchase_order_line_unique");
  if (orderLine && (orderLine.unique !== true || JSON.stringify(orderLine.key) !== JSON.stringify({ orderLineId: 1 }))) {
    throw new IndexInitializationUsageError("Required unique order-line purchase index is incompatible. No index was removed.");
  }
  const legacy = byName(LEGACY_PURCHASE_INDEX);
  if (legacy && (legacy.unique !== true || JSON.stringify(legacy.key) !== JSON.stringify({ userId: 1, productId: 1 }) ||
    JSON.stringify(legacy.partialFilterExpression) !== JSON.stringify({ accessStatus: "active" }))) {
    throw new IndexInitializationUsageError("Legacy active-purchase index has unexpected options. No index was removed.");
  }
  const history = byName(PURCHASE_HISTORY_INDEX);
  if (history && (history.unique === true || history.sparse === true || history.partialFilterExpression !== undefined || JSON.stringify(history.key) !== JSON.stringify({ userId: 1, productId: 1, grantedAt: -1 }))) {
    throw new IndexInitializationUsageError("Purchase-history index has unexpected options. No index was removed.");
  }
  if (!orderLine) {
    const missingOrderLineIdCount = await collection.countDocuments({ $or: [{ orderLineId: { $exists: false } }, { orderLineId: null }] });
    const missingRows = missingOrderLineIdCount ? await collection.find({ $or: [{ orderLineId: { $exists: false } }, { orderLineId: null }] }, { projection: { orderLineId: 1, user: 1, product: 1, userId: 1, productId: 1, orderId: 1 } }).limit(10).toArray() : [];
    const missingClass = classifyMissingOrderLineRows(missingRows as Array<{ orderLineId?: unknown; user?: unknown; product?: unknown; userId?: unknown; productId?: unknown; orderId?: unknown }>);
    if (missingClass.unsafeMissing || missingOrderLineIdCount > 1) throw new IndexInitializationUsageError("Unexpected missing orderLineId records prevent the unique index; no index was removed.");
    const duplicateGroups = await collection.aggregate([
      { $group: { _id: "$orderLineId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).toArray();
    if (duplicateGroups.length) throw new IndexInitializationUsageError("Duplicate order-line purchases prevent the required unique index. No index was removed.");
    await collection.createIndex({ orderLineId: 1 }, { unique: true, name: "purchase_order_line_unique" });
  }
  const verifiedOrderLine = (await collection.indexes()).find((index) => index.name === "purchase_order_line_unique");
  if (!verifiedOrderLine || verifiedOrderLine.unique !== true || JSON.stringify(verifiedOrderLine.key) !== JSON.stringify({ orderLineId: 1 })) {
    throw new IndexInitializationUsageError("Required unique order-line purchase index verification failed. No index was removed.");
  }
  if (!history) await collection.createIndex({ userId: 1, productId: 1, grantedAt: -1 }, { name: PURCHASE_HISTORY_INDEX });
  const checkoutIndexes = await db.collection("checkoutClaims").indexes();
  const claimsSafe = checkoutIndexes.some((index) => index.name === "checkout_claim_one_active_product" && index.unique === true && JSON.stringify(index.key) === JSON.stringify({ userId: 1, productId: 1 }) && JSON.stringify(index.partialFilterExpression) === JSON.stringify({ status: "active" }));
  if (!claimsSafe || !PurchaseModel.schema.path("orderLineId")) throw new IndexInitializationUsageError("Checkout claim protection or modern purchase schema could not be verified; legacy indexes were preserved.");
  const finalLegacyNames = (await collection.indexes()).filter((index) =>
    (index.name === LEGACY_PURCHASE_INDEX && index.unique === true && JSON.stringify(index.key) === JSON.stringify({ userId: 1, productId: 1 }) && JSON.stringify(index.partialFilterExpression) === JSON.stringify({ accessStatus: "active" })) || isApprovedLegacyPurchaseIndex(index)
  ).map((index) => index.name).filter((name): name is string => Boolean(name));
  for (const name of finalLegacyNames) await collection.dropIndex(name);
  const finalIndexes = await collection.indexes();
  const finalState = inspectPurchaseIndexes(finalIndexes);
  if (finalState.missing.length || finalState.incompatible.length || finalState.legacyPresent) throw new IndexInitializationUsageError("Final repurchase index verification failed.");
  console.info("Repurchase indexes verified for purchases only; no documents changed.");
}

export function assertConfirmedDatabaseName(actualDatabaseName: string, confirmedDatabaseName: string): void {
  if (actualDatabaseName !== confirmedDatabaseName) {
    throw new IndexInitializationUsageError(
      `Connected database name does not match the confirmed target (${confirmedDatabaseName}). No indexes were changed.`,
    );
  }
}

export function shouldDropLegacyRefundIndex(indexExists: boolean, dropWasExplicitlyRequested: boolean): boolean {
  if (!indexExists) return false;
  if (!dropWasExplicitlyRequested) {
    throw new IndexInitializationUsageError(
      `Legacy index ${LEGACY_REFUND_INDEX} exists. Review the target and rerun with --drop-legacy-refund-index to remove only that index.`,
    );
  }
  return true;
}

interface ExistingOrderIndex {
  name?: string;
  key: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: unknown;
}

/** Match only the obsolete unique index that rejects a second order with no orderNumber. */
export function legacyOrderNumberIndexName(indexes: readonly ExistingOrderIndex[], explicitDrop: boolean): string | null {
  const matches = indexes.filter((index) => index.unique === true && index.sparse !== true &&
    Object.keys(index.key).length === 1 && [1, -1].includes(index.key[LEGACY_ORDER_INDEX_FIELD] as number) &&
    index.partialFilterExpression === undefined);
  if (matches.length === 0) return null;
  if (matches.length !== 1 || !matches[0]?.name || !/^[A-Za-z0-9_-]{1,128}$/.test(matches[0].name)) {
    throw new IndexInitializationUsageError("The legacy orderNumber index is ambiguous. No index was removed.");
  }
  if (!explicitDrop) {
    throw new IndexInitializationUsageError("A legacy unique orderNumber index exists. Review the non-production target and rerun with --drop-legacy-order-number-index --confirm-non-production.");
  }
  return matches[0].name;
}

async function removeLegacyOrderNumberIndex(explicitDrop: boolean): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected.");
  const collectionName = OrderModel.collection.collectionName;
  if (!await db.listCollections({ name: collectionName }, { nameOnly: true }).hasNext()) return;
  const indexes = await db.collection(collectionName).indexes();
  const indexName = legacyOrderNumberIndexName(indexes, explicitDrop);
  if (!indexName) return;
  await db.collection(collectionName).dropIndex(indexName);
  console.info("Removed the reviewed legacy unique orderNumber index from orders.");
}

async function removeLegacyRefundIndex(dropRequested: boolean): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected.");
  const refundsCollection = RefundModel.collection.collectionName;
  const collectionExists = await db.listCollections({ name: refundsCollection }, { nameOnly: true }).hasNext();
  if (!collectionExists) return;

  const indexes = await db.collection(refundsCollection).indexes();
  if (!shouldDropLegacyRefundIndex(indexes.some((index) => index.name === LEGACY_REFUND_INDEX), dropRequested)) return;
  await db.collection(refundsCollection).dropIndex(LEGACY_REFUND_INDEX);
  console.info(`Removed reviewed legacy index ${LEGACY_REFUND_INDEX}.`);
}

export async function runIndexInitialization(args: readonly string[]): Promise<void> {
  const input = parseIndexInitializationArgs(args);
  loadEnvConfig(process.cwd());
  try {
    await connectToDatabase();
    const actualDatabaseName = mongoose.connection.name;
    assertConfirmedDatabaseName(actualDatabaseName, input.databaseName);

    if (input.claimsOnly) {
      await createModelIndexes(CheckoutClaimModel);
      console.info("Indexes verified for checkoutClaims only.");
      return;
    }
    if (input.repurchaseIndexesOnly) {
      if (input.preflightOnly) { await preflightRepurchaseIndexes(); return; }
      await migrateRepurchaseIndexes();
      return;
    }
    if (input.dropLegacyOrderNumberIndex) {
      // Establish current uniqueness protections before removing the obsolete index.
      await OrderModel.createIndexes();
      await removeLegacyOrderNumberIndex(true);
      console.info("Current order indexes verified in the confirmed non-production database.");
      return;
    }

    await removeLegacyOrderNumberIndex(false);
    await removeLegacyRefundIndex(input.dropLegacyRefundIndex);
    const models: IndexableModel[] = [
      UserModel, CategoryModel, ProductModel, ProductAssetModel, ProductMediaModel, OrderModel, PaymentModel,
      PurchaseModel, PersonalizedPdfModel, DownloadLogModel, DownloadRateLimitModel,
      CouponModel, CouponRedemptionModel, BookingModel, WebhookEventModel, OutboxEventModel,
      AuditLogModel, CheckoutClaimModel, RefundModel,
    ];
    for (const model of models) {
      await createModelIndexes(model);
      console.info(`Indexes verified for ${model.collection.collectionName}.`);
    }
    console.info(`Declared MoneyTreeVentures indexes are ready in database ${actualDatabaseName}.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  void runIndexInitialization(process.argv.slice(2)).catch((error: unknown) => {
    console.error(formatIndexFailure(error));
    process.exitCode = 1;
  });
}
