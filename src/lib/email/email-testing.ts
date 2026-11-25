import "server-only";

import { randomUUID, createHash } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "../db/mongodb";
import { AuditLogModel, OutboxEventModel, SupportRateModel } from "../db/models";
import { getServerEnv } from "../env/server";
import { buildPurchaseConfirmation } from "./outbox-service";
import { sendResendMessage, type ResendMessage } from "./resend";

export function emailTestEnvironment(input: { enabled?: string; appUrl?: string; authUrl?: string; database?: string; localDatabase?: string; localRole?: string; nodeEnv?: string; netlify?: string }) {
  if (input.enabled !== "true") return "disabled" as const;
  let url: URL;
  try { url = new URL(input.appUrl ?? ""); } catch { return "wrong_environment" as const; }
  let authOrigin = "";
  try { authOrigin = new URL(input.authUrl ?? "").origin; } catch { /* fail closed */ }
  if (url.protocol === "https:" && authOrigin === url.origin && input.localRole === "staging-only" && input.database && input.database === input.localDatabase && input.database !== "moneytreeventures") return "allowed" as const;
  if (input.nodeEnv === "development" && input.netlify !== "true" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && authOrigin === url.origin && input.localRole === "local-development-only" && input.database === "moneytreeventures" && input.localDatabase === input.database) return "allowed" as const;
  return "wrong_environment" as const;
}

export function emailTestPolicy(input: { enabled?: string; appUrl?: string; authUrl?: string; allowed?: string; recipient: string; database?: string; localDatabase?: string; localRole?: string; nodeEnv?: string; netlify?: string }) {
  const recipient = input.recipient.trim().toLowerCase();
  const environment = emailTestEnvironment(input);
  if (environment !== "allowed") return environment;
  if (recipient.length > 254 || !z.string().email().safeParse(recipient).success) return "invalid_recipient" as const;
  const allowed = (input.allowed ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(recipient)) return "recipient_not_allowed" as const;
  return "allowed" as const;
}

export function buildEmailTestMessage(kind: "basic" | "purchase", reference: string, accountUrl: string): ResendMessage {
  if (kind === "basic") return {
    to: "", subject: `TEST EMAIL - MoneyTreeVentures staging - ${reference}`,
    text: `MoneyTreeVentures staging test email. Reference: ${reference}. No purchase or payment was made.`,
    html: `<p>MoneyTreeVentures staging test email.</p><p>Reference: ${reference}. No purchase or payment was made.</p>`,
  };
  const message = buildPurchaseConfirmation({ name: "Test Customer", orderReference: `TEST-${reference}`, dashboardUrl: accountUrl, lines: [{ productName: "Sample PDF (test only)", quantity: 1, lineTotalPaise: 19900 }], totalPaise: 19900 });
  return { ...message, subject: `TEST EMAIL - ${message.subject}`, text: `STAGING TEMPLATE TEST. No purchase was made.\n\n${message.text}`, html: `<p><strong>STAGING TEMPLATE TEST. No purchase was made.</strong></p>${message.html}` };
}

export function hasEmailTestRateIndex(indexes: readonly { name?: string; key: Record<string, unknown>; unique?: boolean; partialFilterExpression?: unknown }[]): boolean {
  return indexes.some((index) => index.name === "identityHash_1_windowStart_1"
    && index.unique === true
    && index.partialFilterExpression === undefined
    && Object.keys(index.key).length === 2
    && index.key.identityHash === 1
    && index.key.windowStart === 1);
}

async function isRateIndexReady(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db || !(await db.listCollections({ name: SupportRateModel.collection.collectionName }, { nameOnly: true }).hasNext())) return false;
  return hasEmailTestRateIndex(await SupportRateModel.collection.indexes());
}

export async function readEmailTestHealth() {
  const env = getServerEnv();
  const environment = emailTestEnvironment({ enabled: process.env.EMAIL_TESTING_ENABLED, appUrl: env.APP_URL, authUrl: process.env.BETTER_AUTH_URL, database: env.MONGODB_DB_NAME, localDatabase: process.env.EMAIL_TEST_DATABASE_NAME, localRole: process.env.EMAIL_TEST_DATABASE_ROLE, nodeEnv: env.NODE_ENV, netlify: process.env.NETLIFY });
  await connectToDatabase();
  if (mongoose.connection.name !== env.MONGODB_DB_NAME) throw new Error("EMAIL_TEST_DATABASE_MISMATCH");
  const [pending, processing, retry, sent, suppressed, deadLetter, oldest] = await Promise.all([
    OutboxEventModel.countDocuments({ eventType: "purchase_confirmation", status: "pending" }),
    OutboxEventModel.countDocuments({ eventType: "purchase_confirmation", status: "processing" }),
    OutboxEventModel.countDocuments({ eventType: "purchase_confirmation", status: "retry" }),
    OutboxEventModel.countDocuments({ eventType: "purchase_confirmation", status: "sent" }),
    OutboxEventModel.countDocuments({ eventType: "purchase_confirmation", status: "dead_letter", lastErrorCode: "EMAIL_SUPPRESSED" }),
    OutboxEventModel.countDocuments({ eventType: "purchase_confirmation", status: "dead_letter", lastErrorCode: { $ne: "EMAIL_SUPPRESSED" } }),
    OutboxEventModel.findOne({ eventType: "purchase_confirmation", status: "pending" }).sort({ createdAt: 1 }).select("createdAt").lean().exec(),
  ]);
  const rateIndexReady = await isRateIndexReady();
  return { pending, processing, retry, sent, suppressed, deadLetter, oldestPendingAt: oldest?.createdAt ?? null,
    configuration: { testingEnabled: environment === "allowed", resendConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM), workerConfigured: Boolean(env.OUTBOX_WORKER_SECRET), recipientsConfigured: Boolean(process.env.EMAIL_TEST_RECIPIENTS?.trim()), rateIndexReady } };
}

async function claimQuota(adminId: string) {
  if (!(await isRateIndexReady())) throw new Error("RATE_LIMIT_INDEX_MISSING");
  const now = new Date();
  for (const [scope, start, limit] of [
    ["minute", new Date(Math.floor(now.getTime() / 60000) * 60000), 1],
    ["day", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), 5],
  ] as const) {
    const identityHash = createHash("sha256").update(`email-test:${scope}:${adminId}`).digest("hex");
    const result = await SupportRateModel.findOneAndUpdate({ identityHash, windowStart: start, count: { $lt: limit } }, { $inc: { count: 1 }, $setOnInsert: { createdAt: now } }, { upsert: true, new: true }).lean().exec().catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return null;
      throw error;
    });
    if (!result) throw new Error("EMAIL_TEST_RATE_LIMITED");
  }
}

export async function sendEmailTest(adminId: string, recipient: string, kind: "basic" | "purchase") {
  const env = getServerEnv();
  const policy = emailTestPolicy({ enabled: process.env.EMAIL_TESTING_ENABLED, appUrl: env.APP_URL, authUrl: process.env.BETTER_AUTH_URL, allowed: process.env.EMAIL_TEST_RECIPIENTS, recipient, database: env.MONGODB_DB_NAME, localDatabase: process.env.EMAIL_TEST_DATABASE_NAME, localRole: process.env.EMAIL_TEST_DATABASE_ROLE, nodeEnv: env.NODE_ENV, netlify: process.env.NETLIFY });
  if (policy !== "allowed") throw new Error(policy.toUpperCase());
  if (!env.APP_URL) throw new Error("WRONG_ENVIRONMENT");
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("EMAIL_CONFIGURATION_MISSING");
  await connectToDatabase();
  if (mongoose.connection.name !== env.MONGODB_DB_NAME) throw new Error("EMAIL_TEST_DATABASE_MISMATCH");
  await claimQuota(adminId);
  const reference = randomUUID();
  const message = buildEmailTestMessage(kind, reference, `${env.APP_URL.replace(/\/$/, "")}/account`);
  message.to = recipient.trim().toLowerCase();
  await AuditLogModel.create({ actorType: "admin", actorUserId: adminId, action: "email_test.attempted", targetType: "emailTest", targetId: reference, changedFields: [kind] });
  let providerMessageId: string;
  try {
    providerMessageId = await sendResendMessage(message, `email-test/${reference}`);
  } catch (error) {
    await AuditLogModel.create({ actorType: "admin", actorUserId: adminId, action: "email_test.failed", targetType: "emailTest", targetId: reference, changedFields: [kind] }).catch(() => undefined);
    throw error instanceof Error && /^RESEND_[A-Z_0-9]+$/.test(error.message) ? error : new Error("EMAIL_PROVIDER_FAILED");
  }
  await AuditLogModel.create({ actorType: "admin", actorUserId: adminId, action: "email_test.accepted", targetType: "emailTest", targetId: reference, changedFields: [kind] }).catch(() => undefined);
  return { reference, providerMessageId, status: "accepted_by_resend" as const };
}
