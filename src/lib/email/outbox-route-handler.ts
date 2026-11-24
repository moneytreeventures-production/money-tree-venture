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

export function createOutboxRouteHandler(
  processBatch: (limit?: number) => Promise<unknown> = processEmailOutboxBatch,
  readSecret = () => getServerEnv().OUTBOX_WORKER_SECRET,
) {
  return async function POST(request: Request): Promise<Response> {
    const requestId = resolveRequestId(request);
    try {
      const secret = readSecret();
      if (!secret) throw new InternalServerError();
      if (!validWorkerSecret(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null, secret)) {
        return createJsonResponse({ success: false, error: { code: "UNAUTHORIZED", message: "Worker authorization required." } }, requestId, { status: 401 });
      }
      const countText = new URL(request.url).searchParams.get("limit");
      const limit = countText === null ? 10 : Number(countText);
      if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
        return createJsonResponse({ success: false, error: { code: "INVALID_LIMIT", message: "Batch limit must be between 1 and 25." } }, requestId, { status: 400 });
      }
      return createJsonResponse({ success: true, data: await processBatch(limit) }, requestId);
    } catch (error) {
      return createErrorResponse(error, requestId);
    }
  };
}

export const outboxPOST = createOutboxRouteHandler();
