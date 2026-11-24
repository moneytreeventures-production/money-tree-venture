import "server-only";

import { createJsonResponse } from "../http/response";
import { ensureRequestId } from "../http/request-id";
import { normalizeError } from "./normalize";

export interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: readonly { field: string; message: string }[];
  };
  requestId: string;
}

/** Build the shared Route Handler failure response without exposing diagnostics. */
export function createErrorResponse(error: unknown, requestId?: string): Response {
  const normalized = normalizeError(error);
  const safeRequestId = ensureRequestId(requestId);
  const body: ErrorResponseBody = {
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
    requestId: safeRequestId,
  };
  return createJsonResponse(body, safeRequestId, { status: normalized.statusCode });
}
