import "server-only";

import { ValidationError } from "../errors/app-error";

function oversizedBodyError(): ValidationError {
  return new ValidationError([{ field: "body", message: "Request payload is too large." }]);
}

/** Read a request body under a byte limit, including when Content-Length is absent or inaccurate. */
export async function readBoundedRequestBody(request: Request, maxBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError("Body byte limit must be a positive safe integer.");
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    throw oversizedBodyError();
  }

  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw oversizedBodyError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
