import "server-only";

import { isValidRequestId } from "../http/request-id";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Readonly<Record<string, unknown>>;
export type LogSink = (line: string, level: LogLevel) => void;

export interface LoggerOptions {
  environment?: "development" | "production" | "test";
  sink?: LogSink;
}

export interface StructuredLogger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(?:password|passwd|secret|token|api.?key|access.?key|authorization|cookie|session|credential|private.?key|connection.?string|mongo(?:db)?.?uri|signed.?url|presigned.?url|card(?:number|details)?|cvv|email|phone|mobile|address|customer(?:name|phone|email)|cashfree(?:client|secret|webhook)|r2(?:secret|access.?key))/i;

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return SENSITIVE_KEY.test(key) || /(?:password|passwd|secret|token|apikey|accesskey|authorization|cookie|session|credential|privatekey|connectionstring|mongodburi|signedurl|presignedurl|cardnumber|carddetails|cvv|email|phone|mobile|address|cashfreeclient|cashfreesecret|cashfreewebhook|r2secret|r2accesskey)/.test(normalized);
}

function redactString(value: string): string {
  return value
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[REDACTED_MONGODB_URI]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b([A-Z0-9_-]*(?:password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)[A-Z0-9_-]*)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+\?(?:[^\s"'<>]*&)?[^=&#]*(?:signature|token|credential|x-amz)[^=&#]*=[^\s"'<>]*/gi, "[REDACTED_SIGNED_URL]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .slice(0, 4000);
}

type SafeValue = null | boolean | number | string | SafeValue[] | { [key: string]: SafeValue };

function sanitizeError(error: Error, seen: WeakSet<object>, depth: number): SafeValue {
  if (seen.has(error)) return "[Circular Error]";
  seen.add(error);

  const name = typeof error.name === "string" ? error.name : "Error";
  const validationFields = (error as Error & { errors?: unknown }).errors;
  if (name === "ValidationError" && validationFields && typeof validationFields === "object") {
    return { name, message: "Mongoose validation failed.", fields: safeErrorFields(validationFields) };
  }
  if (name === "ZodError") {
    return { name, message: "Request validation failed." };
  }
  if (name === "CastError") {
    const path = (error as Error & { path?: unknown }).path;
    return { name, message: "Mongoose value conversion failed.", ...(typeof path === "string" ? { field: safeFieldName(path) } : {}) };
  }
  if ((error as Error & { code?: unknown }).code === 11000) {
    return { name, message: "MongoDB duplicate-key conflict.", code: 11000 };
  }

  const result: Record<string, SafeValue> = {
    name: redactString(name || "Error"),
    message: redactString(error.message || ""),
  };
  if (typeof error.stack === "string") result.stack = redactString(error.stack);
  if (depth < 5 && "cause" in error && error.cause !== undefined) {
    result.cause = sanitizeValue(error.cause, "cause", seen, depth + 1);
  }
  return result;
}

function safeFieldName(value: string): string {
  return value.split(".").map((part) => /^[A-Za-z0-9_$-]{1,80}$/.test(part) ? part : "field").join(".").slice(0, 160);
}

function safeErrorFields(errors: unknown): SafeValue[] {
  if (!errors || typeof errors !== "object") return [];
  try {
    return Object.keys(errors).slice(0, 20).map(safeFieldName);
  } catch {
    return [];
  }
}

function sanitizeValue(value: unknown, key: string, seen: WeakSet<object>, depth = 0): SafeValue {
  if (isSensitiveKey(key)) return REDACTED;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (depth >= 8) return "[Max depth]";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "[Invalid Date]" : value.toISOString();
  if (value instanceof Error) return sanitizeError(value, seen, depth);
  if (typeof value !== "object") return "[Unsupported value]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  try {
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeValue(item, "", seen, depth + 1));
    const output: Record<string, SafeValue> = {};
    for (const childKey of Object.keys(value).slice(0, 100)) {
      try {
        output[childKey] = sanitizeValue((value as Record<string, unknown>)[childKey], childKey, seen, depth + 1);
      } catch {
        output[childKey] = "[Unavailable]";
      }
    }
    return output;
  } catch {
    return "[Unserializable value]";
  }
}

const consoleSink: LogSink = (line, level) => {
  console[level](line);
};

export function createLogger(options: LoggerOptions = {}): StructuredLogger {
  const environment = options.environment ?? process.env.NODE_ENV ?? "development";
  const sink = options.sink ?? consoleSink;

  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    if (level === "debug" && environment === "production") return;

    try {
      const requestId = isValidRequestId(fields.requestId) ? fields.requestId : undefined;
      const safeFields = sanitizeValue(fields, "metadata", new WeakSet()) as Record<string, SafeValue>;
      delete safeFields.requestId;
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message: redactString(message),
        ...(requestId ? { requestId } : {}),
        ...safeFields,
      };
      sink(JSON.stringify(entry), level);
    } catch {
      // Logging should never mask the failure being handled by the caller.
      try {
        sink(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", message: "Log entry could not be serialized." }), "error");
      } catch {
        // There is no safe recovery when the configured sink itself throws.
      }
    }
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}

export const logger = createLogger();
