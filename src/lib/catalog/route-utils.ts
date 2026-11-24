
import "server-only";

import { ValidationError } from "../errors/app-error";
import { readBoundedRequestBody } from "../http/request-body";

export const JSON_REQUEST_BODY_MAX_BYTES = 128 * 1024;

export async function readJsonBody(request: Request): Promise<unknown> {
  const rawBody = await readBoundedRequestBody(request, JSON_REQUEST_BODY_MAX_BYTES);
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new ValidationError([
      { field: "body", message: "A valid JSON request body is required." },
    ]);
  }
}
