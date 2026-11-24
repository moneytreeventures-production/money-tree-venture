import "server-only";

import { ensureRequestId, REQUEST_ID_HEADER } from "./request-id";

/** JSON success response helper that always returns a validated correlation ID. */
export function createJsonResponse<T>(body: T, requestId?: string, init: ResponseInit = {}): Response {
  const safeRequestId = ensureRequestId(requestId);
  const headers = new Headers(init.headers);
  headers.set(REQUEST_ID_HEADER, safeRequestId);
  return Response.json(body, { ...init, headers });
}
