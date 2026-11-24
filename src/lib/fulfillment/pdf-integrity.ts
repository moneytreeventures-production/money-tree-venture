import { createHash } from "node:crypto";

/** Require a stored upload digest and compare it with the private master bytes before personalization. */
export function hasMatchingPdfSha256(bytes: Uint8Array, expected?: string): boolean {
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actual = createHash("sha256").update(bytes).digest("hex");
  return actual.toLowerCase() === expected.toLowerCase();
}
