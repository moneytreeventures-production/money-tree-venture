import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { z } from "zod";
import {
  ApplicationError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DatabaseError,
  ExternalServiceError,
  IntegrationConfigurationError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "../../src/lib/errors/app-error";
import { createErrorResponse } from "../../src/lib/errors/response";
import { normalizeError } from "../../src/lib/errors/normalize";
import { UserModel } from "../../src/lib/db/models";

test("base application errors retain stable properties, safe details, and causes", () => {
  const cause = new Error("private internal diagnostic");
  const error = new ApplicationError("Safe message.", {
    code: "EXAMPLE_FAILURE",
    statusCode: 409,
    operational: true,
    details: [{ field: "quantity", message: "Value is invalid." }],
    cause,
  });

  assert.equal(error.code, "EXAMPLE_FAILURE");
  assert.equal(error.statusCode, 409);
  assert.equal(error.operational, true);
  assert.equal(error.cause, cause);
  assert.equal(error.details?.[0]?.field, "quantity");
});

test("specialized application errors expose their intended status and stable code", () => {
  const cases = [
    [new ValidationError(), 400, "VALIDATION_ERROR"],
    [new AuthenticationError(), 401, "AUTHENTICATION_REQUIRED"],
    [new AuthorizationError(), 403, "FORBIDDEN"],
    [new NotFoundError(), 404, "NOT_FOUND"],
    [new ConflictError(), 409, "CONFLICT"],
    [new RateLimitError(), 429, "RATE_LIMITED"],
    [new DatabaseError(), 503, "DATABASE_UNAVAILABLE"],
    [new ExternalServiceError(), 502, "EXTERNAL_SERVICE_ERROR"],
    [new InternalServerError(), 500, "INTERNAL_ERROR"],
  ] as const;

  for (const [error, status, code] of cases) {
    assert.equal(error.statusCode, status);
    assert.equal(error.code, code);
  }
  assert.equal(new InternalServerError().operational, false);
  assert.equal(new DatabaseError().operational, true);
});

test("integration configuration failures use clear English and identify missing keys safely", async () => {
  const error = new IntegrationConfigurationError("Tax", ["TAX_RATE_BPS"]);
  const response = createErrorResponse(error, "config-error-1234");
  const body = await response.json() as { error: { code: string; message: string; details?: { field: string }[] } };

  assert.equal(body.error.code, "TAX_CONFIGURATION_ERROR");
  assert.equal(body.error.message, "This service is temporarily unavailable because required configuration is incomplete.");
  assert.equal(body.error.details?.[0]?.field, "TAX_RATE_BPS");
  assert.doesNotMatch(JSON.stringify(body), /secret|credential value/i);
});

test("Zod failures normalize to safe field-only details", () => {
  const result = z.object({ email: z.string().email() }).safeParse({ email: "private-input-value" });
  assert.equal(result.success, false);
  if (result.success) return;

  const normalized = normalizeError(result.error);
  assert.equal(normalized.code, "VALIDATION_ERROR");
  assert.equal(normalized.statusCode, 400);
  assert.equal(normalized.details?.[0]?.field, "email");
  assert.doesNotMatch(JSON.stringify(normalized.details), /private-input-value/);
});

test("Mongoose validation failures normalize without exposing rejected values", async () => {
  const user = new UserModel({
    authUserId: "auth-test",
    name: "Buyer",
    email: "not-an-email-private",
  });
  let validationError: unknown;
  try {
    await user.validate();
  } catch (error) {
    validationError = error;
  }
  assert.ok(validationError instanceof mongoose.Error.ValidationError);

  const normalized = normalizeError(validationError);
  assert.equal(normalized.statusCode, 400);
  assert.ok(normalized.details?.some((detail) => detail.field === "email"));
  assert.equal(Object.keys(normalized).includes("diagnostic"), false);
  assert.doesNotMatch(JSON.stringify({ code: normalized.code, statusCode: normalized.statusCode, message: normalized.message, details: normalized.details }), /not-an-email-private/);
  const response = createErrorResponse(validationError, "validation-1234");
  assert.doesNotMatch(await response.text(), /not-an-email-private/);
});

test("MongoDB duplicate-key failures map to a safe conflict", () => {
  const duplicate = Object.assign(new Error("E11000 duplicate key private@email.example"), {
    code: 11000,
    keyValue: { email: "private@email.example" },
  });
  const normalized = normalizeError(duplicate);
  assert.equal(normalized.statusCode, 409);
  assert.equal(normalized.code, "CONFLICT");
  assert.doesNotMatch(normalized.message, /private@email|E11000/);
});

test("MongoDB connection failures map to a safe unavailable response", () => {
  const failure = new mongoose.Error.MongooseServerSelectionError(
    "mongodb+srv://private-user:private-password@cluster.example/private-db",
  );
  const normalized = normalizeError(failure);
  assert.equal(normalized.statusCode, 503);
  assert.equal(normalized.code, "DATABASE_UNAVAILABLE");
  assert.doesNotMatch(normalized.message, /private-password|cluster\.example|private-db/);
});

test("unexpected errors and non-operational application errors use generic public details", () => {
  const unknown = normalizeError(new TypeError("private implementation detail"));
  assert.equal(unknown.statusCode, 500);
  assert.equal(unknown.code, "INTERNAL_ERROR");
  assert.doesNotMatch(unknown.message, /private implementation/);

  const nonOperational = normalizeError(new ApplicationError("internal-only", { code: "SECRET_INTERNAL_CODE", statusCode: 500, operational: false }));
  assert.equal(nonOperational.code, "INTERNAL_ERROR");
  assert.equal(nonOperational.message, "Something went wrong. Please try again.");
});

test("normalization does not throw for malformed error-like values", () => {
  const malformed = new Proxy({}, { get: () => { throw new Error("hostile getter"); } });
  assert.doesNotThrow(() => normalizeError(malformed));
  assert.equal(normalizeError(malformed).code, "INTERNAL_ERROR");
});

test("API error responses use a consistent safe JSON shape, status, and request ID", async () => {
  const response = createErrorResponse(new ValidationError([{ field: "email", message: "This field is invalid." }]), "request-123456");
  const body = await response.json() as {
    success: boolean;
    error: { code: string; message: string; details?: { field: string; message: string }[] };
    requestId: string;
  };

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("x-request-id"), "request-123456");
  assert.deepEqual(body, {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Please check the information you entered.",
      details: [{ field: "email", message: "This field is invalid." }],
    },
    requestId: "request-123456",
  });
});

test("API responses hide unexpected diagnostics and replace invalid request IDs", async () => {
  const response = createErrorResponse(new Error("mongodb://user:secret@private-host/private-db"), "bad\r\nid");
  const serialized = await response.text();
  assert.equal(response.status, 500);
  assert.match(response.headers.get("x-request-id") ?? "", /^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/);
  assert.doesNotMatch(serialized, /secret|private-host|private-db|stack|cause/);
});
