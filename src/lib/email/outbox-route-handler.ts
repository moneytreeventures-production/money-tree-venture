import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getServerEnv } from "../env/server";
import { InternalServerError } from "../errors/app-error";
import { createErrorResponse } from "../errors/response";
import { createJsonResponse } from "../http/response";
import { resolveRequestId } from "../http/request-id";
import { processEmailOutboxBatch } from "./outbox-service";

function validWorkerSecret(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function localWorkerCutoffAllowed(input: { enabled?: string; nodeEnv?: string; netlify?: string; appUrl?: string; database?: string; testDatabase?: string; role?: string }): boolean {
  let origin: URL;
  try { origin = new URL(input.appUrl ?? ""); } catch { return false; }
  return input.enabled === "true" && input.nodeEnv === "development" && input.netlify !== "true" && origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname) && input.role === "local-development-only" && input.database === "moneytreeventures" && input.testDatabase === input.database;
}

export function createOutboxRouteHandler(
  processBatch: (limit?: number, createdAfter?: Date) => Promise<unknown> = processEmailOutboxBatch,
  readSecret = () => getServerEnv().OUTBOX_WORKER_SECRET,
) {
  return async function POST(request: Request): Promise<Response> {
    const requestId = resolveRequestId(request);
    try {
      const secret = readSecret();
      if (!secret) throw new InternalServerError();
      if (!validWorkerSecret(request.headers.get("authorization")?.match(/^Bearer[ \t]+(\S+)$/i)?.[1] ?? null, secret)) {
        return createJsonResponse({ success: false, error: { code: "UNAUTHORIZED", message: "Worker authorization required." } }, requestId, { status: 401 });
      }
      const countText = new URL(request.url).searchParams.get("limit");
      const limit = countText === null ? 10 : Number(countText);
      if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
        return createJsonResponse({ success: false, error: { code: "INVALID_LIMIT", message: "Batch limit must be between 1 and 25." } }, requestId, { status: 400 });
      }
      const afterText = new URL(request.url).searchParams.get("createdAfter");
      let createdAfter: Date | undefined;
      if (afterText !== null) {
        const env = getServerEnv();
        if (!localWorkerCutoffAllowed({ enabled: process.env.EMAIL_LOCAL_WORKER_ENABLED, nodeEnv: env.NODE_ENV, netlify: process.env.NETLIFY, appUrl: env.APP_URL, database: env.MONGODB_DB_NAME, testDatabase: process.env.EMAIL_TEST_DATABASE_NAME, role: process.env.EMAIL_TEST_DATABASE_ROLE }) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(afterText)) {
          return createJsonResponse({ success: false, error: { code: "LOCAL_WORKER_DISABLED", message: "Local worker mode is unavailable." } }, requestId, { status: 403 });
        }
        createdAfter = new Date(afterText);
        if (Number.isNaN(createdAfter.getTime()) || createdAfter.getTime() > Date.now()) return createJsonResponse({ success: false, error: { code: "INVALID_CUTOFF", message: "Invalid worker cutoff." } }, requestId, { status: 400 });
      }
      return createJsonResponse({ success: true, data: await processBatch(limit, createdAfter) }, requestId);
    } catch (error) {
      return createErrorResponse(error, requestId);
    }
  };
}

export const outboxPOST = createOutboxRouteHandler();
