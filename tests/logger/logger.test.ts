import assert from "node:assert/strict";
import { test } from "node:test";
import { UserModel } from "../../src/lib/db/models";
import { createLogger, type LogLevel } from "../../src/lib/logger";

function capture(environment: "development" | "production" | "test" = "test") {
  const output: Array<{ line: string; level: LogLevel }> = [];
  const logger = createLogger({ environment, sink: (line, level) => output.push({ line, level }) });
  return { logger, output };
}

test("logger emits structured JSON with timestamps, level, message, and request ID", () => {
  const { logger, output } = capture();
  logger.info("Order check complete", { requestId: "request-123456", attempt: 2 });
  assert.equal(output.length, 1);
  assert.equal(output[0]?.level, "info");
  const entry = JSON.parse(output[0]?.line ?? "{}") as Record<string, unknown>;
  assert.equal(entry.level, "info");
  assert.equal(entry.message, "Order check complete");
  assert.equal(entry.requestId, "request-123456");
  assert.equal(entry.attempt, 2);
  assert.equal(typeof entry.timestamp, "string");
});

test("logger preserves practical log levels and suppresses debug in production", () => {
  const production = capture("production");
  production.logger.debug("hidden diagnostic");
  production.logger.info("ready");
  production.logger.warn("retrying");
  production.logger.error("failed");
  assert.deepEqual(production.output.map(({ level }) => level), ["info", "warn", "error"]);

  const development = capture("development");
  development.logger.debug("visible locally");
  assert.equal(development.output.length, 1);
});

test("logger redacts sensitive key names and nested values", () => {
  const { logger, output } = capture();
  logger.warn("Configuration inspected", {
    password: "password-value",
    xApiKey: "api-key-value",
    nested: {
      CASHFREE_CLIENT_SECRET: "cashfree-secret-value",
      R2_ACCESS_KEY_ID: "r2-access-value",
      awsAccessKeyId: "aws-access-value",
      customerEmail: "buyer@example.com",
      ordinary: "kept",
    },
  });
  const line = output[0]?.line ?? "";
  assert.doesNotMatch(line, /password-value|api-key-value|cashfree-secret-value|r2-access-value|aws-access-value|buyer@example\.com/);
  assert.match(line, /\[REDACTED\]/);
  assert.match(line, /"ordinary":"kept"/);
});

test("logger redacts credentials embedded in common strings and URLs", () => {
  const { logger, output } = capture();
  logger.error("Request failed", {
    message: "mongodb+srv://user:mongodb-password@host/private?token=abc Bearer token-value password=plain-value",
    downloadUrl: "https://files.example.test/a.pdf?X-Amz-Signature=signed-value",
  });
  const line = output[0]?.line ?? "";
  assert.doesNotMatch(line, /mongodb-password|private\?|token-value|plain-value|signed-value/);
  assert.match(line, /REDACTED_MONGODB_URI/);
  assert.match(line, /REDACTED_SIGNED_URL/);
});

test("logger serializes Error objects and causes without leaking embedded secrets", () => {
  const { logger, output } = capture();
  const root = new Error("mongodb://db-user:db-secret@atlas.example/app");
  const error = new Error("Bearer access-secret", { cause: root });
  logger.error("Database operation failed", { error });
  const line = output[0]?.line ?? "";
  assert.match(line, /"name":"Error"/);
  assert.match(line, /"cause"/);
  assert.doesNotMatch(line, /db-secret|db-user|atlas\.example|access-secret/);
});

test("logger summarizes Mongoose validation errors without logging rejected field values", async () => {
  const user = new UserModel({ authUserId: "auth-log-test", name: "Buyer", email: "private-value" });
  let error: unknown;
  try {
    await user.validate();
  } catch (caught) {
    error = caught;
  }
  const { logger, output } = capture();
  logger.error("Validation failed", { error });
  const line = output[0]?.line ?? "";
  assert.match(line, /Mongoose validation failed/);
  assert.doesNotMatch(line, /private-value/);
});

test("logger does not emit a configured environment secret passed in metadata", () => {
  const key = "CASHFREE_CLIENT_SECRET";
  const previous = process.env[key];
  process.env[key] = "never-log-this-secret";
  try {
    const { logger, output } = capture();
    logger.info("Environment check", { environment: process.env });
    assert.doesNotMatch(output[0]?.line ?? "", /never-log-this-secret/);
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("logger remains non-throwing when metadata or a configured sink fails", () => {
  const hostile = new Proxy({}, { ownKeys: () => { throw new Error("hostile object"); } });
  const { logger } = capture();
  assert.doesNotThrow(() => logger.error("Unable to inspect", hostile));

  const failing = createLogger({ environment: "test", sink: () => { throw new Error("sink failed"); } });
  assert.doesNotThrow(() => failing.error("sink failure"));
});
