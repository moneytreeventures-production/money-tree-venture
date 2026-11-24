import "server-only";

import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function createRequestId(): string {
  return randomUUID();
}

export function ensureRequestId(value: unknown): string {
  return isValidRequestId(value) ? value : createRequestId();
}

/**
 * Incoming IDs are accepted only when an upstream proxy is configured to
 * replace this header. Public clients can otherwise spoof log correlation.
 */
export function resolveRequestId(
  request: Pick<Request, "headers">,
  options: { trustIncomingHeader?: boolean; headerName?: string } = {},
): string {
  if (options.trustIncomingHeader) {
    const candidate = request.headers.get(options.headerName ?? REQUEST_ID_HEADER);
    if (isValidRequestId(candidate)) return candidate;
  }
  return createRequestId();
}
