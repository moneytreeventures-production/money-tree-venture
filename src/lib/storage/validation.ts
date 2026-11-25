import "server-only";

import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { ValidationError } from "../errors/app-error";
import type { UploadPdfInput } from "./types";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const UUID_PDF = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;
const MAX_SIGNED_URL_TTL_SECONDS = 900;

export function assertSafePdfFileName(fileName: string): string {
  const normalized = fileName.normalize("NFC").trim();
  if (normalized.length < 5 || normalized.length > 180 ||
      normalized === "." || normalized === ".." ||
      /[\\/\u0000-\u001f\u007f]/.test(normalized) ||
      normalized.startsWith(".") || !normalized.toLowerCase().endsWith(".pdf")) {
    throw new ValidationError([{ field: "fileName", message: "Filename format is invalid." }]);
  }
  return normalized;
}

export function assertSafeObjectKey(objectKey: string): string {
  const segments = objectKey.split("/");
  const privateKeyShape = segments[0] === "masters"
    ? segments.length === 4 && SAFE_ID.test(segments[1]) && segments[2] === "versions" && UUID_PDF.test(segments[3])
    : segments[0] === "personalized" && segments.length === 3 && SAFE_ID.test(segments[1]) && UUID_PDF.test(segments[2]);
  if (objectKey.length < 5 || objectKey.length > 1024 ||
      !privateKeyShape ||
      objectKey.startsWith("/") || objectKey.includes("\\") ||
      /[\u0000-\u001f\u007f?#]/.test(objectKey) ||
      segments.some((part) => !part || part === "." || part === ".." || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(part)) ||
      !objectKey.toLowerCase().endsWith(".pdf")) {
    throw new ValidationError([{ field: "objectKey", message: "Object key format is invalid." }]);
  }
  return objectKey;
}

export function createPrivatePdfObjectKey(kind: "masters" | "personalized", ownerId: string): string {
  if (!SAFE_ID.test(ownerId)) {
    throw new ValidationError([{ field: "ownerId", message: "Object owner reference is invalid." }]);
  }
  const key = kind === "masters"
    ? `masters/${ownerId}/versions/${randomUUID()}.pdf`
    : `personalized/${ownerId}/${randomUUID()}.pdf`;
  return assertSafeObjectKey(key);
}

export function validatePdfUpload(input: UploadPdfInput, maximumBytes: number): UploadPdfInput {
  assertSafeObjectKey(input.objectKey);
  assertSafePdfFileName(input.originalFileName);
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || input.body.byteLength > maximumBytes) {
    throw new ValidationError([{ field: "file", message: "PDF file size is outside the allowed limit." }]);
  }
  if (input.contentType !== "application/pdf" ||
      input.body.byteLength < 5 || Buffer.from(input.body.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw new ValidationError([{ field: "file", message: "A valid PDF file is required." }]);
  }
  if (!input.metadata || typeof input.metadata !== "object") {
    throw new ValidationError([{ field: "metadata", message: "Required PDF metadata is missing." }]);
  }
  for (const field of ["assetId", "productId", "version"] as const) {
    const value = input.metadata[field];
    if (!(field === "version" ? SAFE_VERSION : SAFE_ID).test(value)) {
      throw new ValidationError([{ field: `metadata.${field}`, message: "Required PDF metadata is invalid." }]);
    }
  }
  return input;
}

/** Parse the complete PDF before a master asset is accepted for fulfilment. */
export async function assertReadablePdfDocument(body: Uint8Array): Promise<void> {
  try {
    await PDFDocument.load(body, { updateMetadata: false });
  } catch {
    throw new ValidationError([{ field: "file", message: "The PDF could not be read. Select a valid, unencrypted PDF." }]);
  }
}

export function validateSignedUrlExpiry(expiresInSeconds: number): number {
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
    throw new ValidationError([{ field: "expiresInSeconds", message: "Signed URL expiry must be between 1 and 900 seconds." }]);
  }
  return expiresInSeconds;
}
