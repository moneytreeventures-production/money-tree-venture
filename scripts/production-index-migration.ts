import { loadEnvConfig } from "@next/env";
import type { CreateIndexesOptions, IndexSpecification } from "mongodb";
import mongoose from "mongoose";
import { connectToDatabase } from "../src/lib/db/mongodb";
import { inspectManagedDatabase, managedModels } from "./initialize-indexes";

export const PRODUCTION_DATABASE = "moneytreeventure-prod";

type ExpectedIndex = { name: string; key: Record<string, unknown>; options: Record<string, unknown> };
type CollectionInspection = { name: string; exists: boolean; status: string; missing: string[]; incompatible: string[] };
export type ProductionInspection = { database: string; collections: CollectionInspection[] };
type DuplicateCheck = { collection: string; index: string; conflict: boolean };

export class ProductionIndexUsageError extends Error {}

export function parseProductionIndexArgs(args: readonly string[]) {
  const preflight = args.length === 3 && args[0] === "--preflight" && args[1] === "--confirm-database" && args[2] === PRODUCTION_DATABASE;
  const applyWithBackup = args.length === 7 && args[0] === "--apply" && args[1] === "--confirm-database" && args[2] === PRODUCTION_DATABASE &&
    args[3] === "--confirm-production-index-migration" && args[4] === "--confirm-backup-ready" && args[5] === "--backup-reference" &&
    /^[A-Za-z0-9._:-]{8,128}$/.test(args[6] ?? "");
  const applyWithoutBackup = args.length === 5 && args[0] === "--apply" && args[1] === "--confirm-database" && args[2] === PRODUCTION_DATABASE &&
    args[3] === "--confirm-production-index-migration" && args[4] === "--authorize-production-index-migration-without-backup";
  const apply = applyWithBackup || applyWithoutBackup;
  if (!preflight && !apply) throw new ProductionIndexUsageError("Use the dedicated production preflight, or supply exact production confirmation, migration authorization and either backup attestation with a reference or --authorize-production-index-migration-without-backup. No connection was attempted.");
  return { apply };
}

/** No URI, credentials, or backup reference is included in failures. */
export function assertProductionDatabaseIdentity(configured: string | undefined, uri: string | undefined, connected?: string): void {
  if (configured !== PRODUCTION_DATABASE) throw new ProductionIndexUsageError("Configured database is not the confirmed production target; no index was changed.");
  let uriDatabase: string;
  try { uriDatabase = decodeURIComponent(new URL(uri ?? "").pathname.slice(1)); }
  catch { throw new ProductionIndexUsageError("MongoDB URI is invalid; no connection was attempted."); }
  if (uriDatabase !== PRODUCTION_DATABASE) throw new ProductionIndexUsageError("MongoDB URI database path is not the confirmed production target; no connection was attempted.");
  if (connected !== undefined && connected !== PRODUCTION_DATABASE) throw new ProductionIndexUsageError("Connected database is not the confirmed production target; no index was changed.");
}

function indexName(key: Record<string, unknown>, options: Record<string, unknown>): string {
  return typeof options.name === "string" ? options.name : Object.entries(key).map(([field, direction]) => `${field}_${direction}`).join("_");
}

export function productionIndexDefinitions(): Map<string, ExpectedIndex[]> {
  return new Map(managedModels.map((model) => [model.collection.collectionName,
    (model.schema?.indexes() ?? []).map(([key, options]) => ({ name: indexName(key, options), key, options }))]));
}

export function duplicateMatch(index: ExpectedIndex): Record<string, unknown> | null {
  const partial = index.options.partialFilterExpression;
  if (partial !== undefined && (!partial || typeof partial !== "object" || Array.isArray(partial))) throw new ProductionIndexUsageError("Unsupported partial index definition; no index was changed.");
  if (index.options.sparse === true && partial !== undefined) throw new ProductionIndexUsageError("Index combines sparse and partial options; no index was changed.");
  if (partial !== undefined) return partial as Record<string, unknown>;
  if (index.options.sparse === true) return { $or: Object.keys(index.key).map((field) => ({ [field]: { $exists: true } })) };
  return null;
}

export function duplicatePipeline(index: ExpectedIndex): Record<string, unknown>[] {
  const match = duplicateMatch(index);
  const groupId = Object.fromEntries(Object.keys(index.key).map((field, i) => [`k${i}`, `$${field}`]));
  return [
    ...(match ? [{ $match: match }] : []),
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
    { $project: { _id: 0, conflict: { $literal: true } } },
  ];
}

export function summarizeProductionPreflight(inspection: ProductionInspection, checks: DuplicateCheck[]) {
  const collections = inspection.collections.map((entry) => ({ collection: entry.name, status: entry.status, exists: entry.exists, missing: entry.missing, incompatible: entry.incompatible }));
  const duplicateConflicts = checks.filter((check) => check.conflict).map(({ collection, index }) => ({ collection, index }));
  const safeToInitialize = collections.every((entry) => entry.exists || entry.status === "NOT_APPLICABLE") &&
    collections.every((entry) => entry.incompatible.length === 0) && duplicateConflicts.length === 0;
  return {
    database: inspection.database,
    status: safeToInitialize ? "SAFE" : "BLOCKED",
    safeToInitialize,
    collections,
    duplicateConflicts,
    uniqueIndexesChecked: checks.length,
    backup: { status: "OPERATOR_VERIFICATION_REQUIRED", prerequisites: ["Confirm a completed Atlas snapshot or restorable backup for this exact cluster and database", "Record its reference and verify restore access and retention", "Record a rollback plan; MongoDB index creation is not transactional"] },
  };
}

export interface ProductionIndexAdapter {
  inspect(): Promise<ProductionInspection>;
  hasDuplicate(collection: string, index: ExpectedIndex): Promise<boolean>;
  createIndex(collection: string, index: ExpectedIndex): Promise<void>;
}

export async function preflightProductionIndexes(adapter: ProductionIndexAdapter) {
  const inspection = await adapter.inspect();
  if (inspection.database !== PRODUCTION_DATABASE) throw new ProductionIndexUsageError("Connected database is not the confirmed production target; no index was changed.");
  const definitions = productionIndexDefinitions();
  const checks: DuplicateCheck[] = [];
  for (const entry of inspection.collections) {
    if (!entry.exists) continue;
    for (const index of definitions.get(entry.name) ?? []) {
      if (index.options.unique === true) checks.push({ collection: entry.name, index: index.name, conflict: await adapter.hasDuplicate(entry.name, index) });
    }
  }
  return summarizeProductionPreflight(inspection, checks);
}

export async function applyProductionIndexes(adapter: ProductionIndexAdapter) {
  const preflight = await preflightProductionIndexes(adapter);
  const created: Array<{ collection: string; index: string }> = [];
  if (!preflight.safeToInitialize) return { ...preflight, migration: { status: "BLOCKED", created } };
  const definitions = productionIndexDefinitions();
  for (const entry of preflight.collections) {
    for (const name of entry.missing) {
      const index = definitions.get(entry.collection)?.find((item) => item.name === name);
      if (!index) return { ...preflight, migration: { status: "PARTIAL_FAILURE", created, failed: { collection: entry.collection, index: name, stage: "resolve_definition" } } };
      try { await adapter.createIndex(entry.collection, index); }
      catch (error) {
        const candidate = error as { name?: unknown; code?: unknown };
        return { ...preflight, migration: { status: "PARTIAL_FAILURE", created, failed: { collection: entry.collection, index: name, stage: "create_index", errorName: typeof candidate?.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(candidate.name) ? candidate.name : "Error", errorCode: typeof candidate?.code === "number" ? candidate.code : null } } };
      }
      created.push({ collection: entry.collection, index: name });
    }
  }
  let verified: ProductionInspection;
  try { verified = await adapter.inspect(); }
  catch { return { ...preflight, migration: { status: "PARTIAL_FAILURE", created, failed: { stage: "verify_indexes" } } }; }
  const ready = verified.database === PRODUCTION_DATABASE && verified.collections.every((entry) => entry.status === "PASS" || entry.status === "NOT_APPLICABLE");
  return { ...preflight, migration: { status: ready ? "COMPLETE" : "PARTIAL_FAILURE", created, verification: verified.collections.map((entry) => ({ collection: entry.name, status: entry.status, missing: entry.missing, incompatible: entry.incompatible })) } };
}

function databaseAdapter(): ProductionIndexAdapter {
  const db = mongoose.connection.db;
  if (!db) throw new ProductionIndexUsageError("MongoDB is not connected.");
  return {
    inspect: inspectManagedDatabase,
    async hasDuplicate(collection, index) {
      const options = { maxTimeMS: 30_000, ...(index.options.collation ? { collation: index.options.collation as CreateIndexesOptions["collation"] } : {}) };
      const found = await db.collection(collection).aggregate(duplicatePipeline(index), options).hasNext();
      return found;
    },
    async createIndex(collection, index) {
      await db.collection(collection).createIndex(index.key as IndexSpecification, { ...index.options, name: index.name } as CreateIndexesOptions);
    },
  };
}

export async function runProductionIndexMigration(args: readonly string[]): Promise<void> {
  const { apply } = parseProductionIndexArgs(args);
  loadEnvConfig(process.cwd());
  assertProductionDatabaseIdentity(process.env.MONGODB_DB_NAME, process.env.MONGODB_URI);
  try {
    await connectToDatabase();
    assertProductionDatabaseIdentity(process.env.MONGODB_DB_NAME, process.env.MONGODB_URI, mongoose.connection.name);
    const adapter = databaseAdapter();
    if (apply) {
      const report = await applyProductionIndexes(adapter);
      console.info(JSON.stringify(report));
      if (report.migration.status !== "COMPLETE") process.exitCode = 1;
    } else {
      const report = await preflightProductionIndexes(adapter);
      console.info(JSON.stringify(report));
      if (!report.safeToInitialize) process.exitCode = 1;
    }
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) {
  void runProductionIndexMigration(process.argv.slice(2)).catch((error: unknown) => {
    const candidate = error as { name?: unknown; code?: unknown };
    console.error(JSON.stringify({ status: "ERROR", stage: "connection_or_preflight", errorName: typeof candidate?.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(candidate.name) ? candidate.name : "Error", errorCode: typeof candidate?.code === "number" ? candidate.code : null, message: error instanceof ProductionIndexUsageError ? error.message : "Production index operation failed; no secret or database value was printed." }));
    process.exitCode = 1;
  });
}
