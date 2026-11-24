import "server-only";

import mongoose from "mongoose";
import { ZodError } from "zod";
import {
  ApplicationError,
  ConflictError,
  DatabaseError,
  InternalServerError,
  ValidationError,
  type SafeErrorDetail,
} from "./app-error";

export interface NormalizedError {
  code: string;
  statusCode: number;
  message: string;
  details?: readonly SafeErrorDetail[];
  operational: boolean;
  /** Keep this for private server logs only. Never serialize it into an API response. */
  diagnostic: unknown;
}

function withDiagnostic(
  safe: Omit<NormalizedError, "diagnostic">,
  diagnostic: unknown,
): NormalizedError {
  Object.defineProperty(safe, "diagnostic", { value: diagnostic, enumerable: false });
  return safe as NormalizedError;
}

function safePath(path: readonly PropertyKey[]): string {
  return path
    .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    .map((part) => {
      if (typeof part === "number") return String(part);
      return /^[A-Za-z0-9_$-]{1,80}$/.test(part) ? part : "field";
    })
    .join(".")
    .slice(0, 160);
}

function safeDetails(details?: readonly SafeErrorDetail[]): SafeErrorDetail[] | undefined {
  if (!details) return undefined;
  return details.slice(0, 20).map((detail) => ({
    field: safePath(detail.field.split(".")),
    message: "This field is invalid.",
  }));
}

function zodDetails(error: ZodError): SafeErrorDetail[] {
  return error.issues.slice(0, 20).map((issue) => ({
    field: safePath(issue.path),
    message: "This field is invalid.",
  }));
}

function mongooseDetails(error: mongoose.Error.ValidationError): SafeErrorDetail[] {
  return Object.keys(error.errors).slice(0, 20).map((path) => ({
    field: path.slice(0, 160),
    message: "This field is invalid.",
  }));
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function getProperty(value: unknown, key: PropertyKey): unknown {
  try {
    return isRecord(value) ? value[key] : undefined;
  } catch {
    return undefined;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return getProperty(error, "code") === 11000 || getProperty(error, "code") === "11000";
}

function isMongoConnectionError(error: unknown): boolean {
  const name = getProperty(error, "name");
  return typeof name === "string" && /(?:Mongoose|Mongo)(?:ServerSelection|Network|NetworkTimeout|Topology)Error/.test(name);
}

/** Convert provider and runtime failures to a safe, stable response description. */
export function normalizeError(error: unknown): NormalizedError {
  try {
    if (error instanceof ApplicationError) {
      if (!error.operational) {
        return withDiagnostic({
          code: "INTERNAL_ERROR",
          statusCode: 500,
          message: "Kuch gadbad ho gayi. Dobara try karein.",
          operational: false,
        }, error);
      }
      const details = safeDetails(error.details);
      return withDiagnostic({
        code: error.code,
        statusCode: error.statusCode,
        message: error.message,
        ...(details ? { details } : {}),
        operational: true,
      }, error);
    }

    if (error instanceof ZodError) {
      const normalized = new ValidationError(zodDetails(error), error);
      return withDiagnostic({ code: normalized.code, statusCode: normalized.statusCode, message: normalized.message, details: normalized.details, operational: true }, error);
    }

    if (error instanceof mongoose.Error.ValidationError) {
      const normalized = new ValidationError(mongooseDetails(error), error);
      return withDiagnostic({ code: normalized.code, statusCode: normalized.statusCode, message: normalized.message, details: normalized.details, operational: true }, error);
    }

    if (error instanceof mongoose.Error.CastError) {
      const normalized = new ValidationError([{ field: error.path, message: "This field is invalid." }], error);
      return withDiagnostic({ code: normalized.code, statusCode: normalized.statusCode, message: normalized.message, details: normalized.details, operational: true }, error);
    }

    if (isDuplicateKeyError(error)) {
      const normalized = new ConflictError(error);
      return withDiagnostic({ code: normalized.code, statusCode: normalized.statusCode, message: normalized.message, operational: true }, error);
    }

    if (isMongoConnectionError(error)) {
      const normalized = new DatabaseError(error);
      return { code: normalized.code, statusCode: normalized.statusCode, message: normalized.message, operational: true, diagnostic: error };
    }
  } catch {
    // Error normalization is a safety boundary; malformed errors still become generic 500s.
  }

  const normalized = new InternalServerError(error);
  return withDiagnostic({
    code: normalized.code,
    statusCode: normalized.statusCode,
    message: normalized.message,
    operational: false,
  }, error);
}
