import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { register } from "../../src/instrumentation";
import { parseServerEnv } from "../../src/lib/env/schema";

function captureError(input: Record<string, string | undefined>): string {
  try {
    parseServerEnv(input);
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }

  assert.fail("Expected environment parsing to fail");
}

test("accepts minimal development configuration and applies safe defaults", () => {
  const env = parseServerEnv({ NODE_ENV: "development" });

  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.R2_REGION, "auto");
  assert.equal(env.DOWNLOAD_URL_TTL_SECONDS, 60);
  assert.equal(env.MONGODB_URI, undefined);
  assert.equal(env.CASHFREE_CLIENT_SECRET, undefined);
});

test("legacy TAX_RATE_BPS does not block new-order environment parsing", () => {
  assert.doesNotThrow(() => parseServerEnv({ TAX_RATE_BPS: "18%" }));
});

test("requires the rest of an integration group after MongoDB configuration begins", () => {
  const message = captureError({ MONGODB_URI: "mongodb://127.0.0.1:27017/test" });

  assert.match(message, /MONGODB_DB_NAME: is required when MongoDB configuration is provided/);
});

test("Google OAuth credentials must be configured together", () => {
  const message = captureError({ GOOGLE_CLIENT_ID: "test-client-id" });
  assert.match(message, /GOOGLE_CLIENT_SECRET: is required when Google OAuth configuration is provided/);
});

test("rejects invalid application and integration URLs", () => {
  const appUrlError = captureError({ APP_URL: "not-a-url" });
  const authUrlError = captureError({
    BETTER_AUTH_SECRET: "a".repeat(40),
    BETTER_AUTH_URL: "file:///tmp/auth",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  });

  assert.match(appUrlError, /APP_URL: must be a valid absolute URL/);
  assert.match(authUrlError, /BETTER_AUTH_URL: must use http or https/);
});

test("rejects an unsupported Cashfree environment", () => {
  const message = captureError({ CASHFREE_ENVIRONMENT: "live" });

  assert.match(message, /CASHFREE_ENVIRONMENT:/);
  assert.match(message, /Invalid option/);
});

test("does not require credentials for integrations that are not configured", () => {
  assert.doesNotThrow(() => parseServerEnv({ NODE_ENV: "test" }));
});

test("rejects malformed supplied credentials without echoing their value", () => {
  const secret = "intentionally-short-secret";
  const message = captureError({
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  });

  assert.match(message, /BETTER_AUTH_SECRET: must be at least 32 characters/);
  assert.doesNotMatch(message, new RegExp(secret));
});

test("rejects browser-prefixed variables until an explicit public allowlist exists", () => {
  const secret = "must-not-appear-in-client";
  const message = captureError({ NEXT_PUBLIC_CASHFREE_CLIENT_SECRET: secret });

  assert.match(message, /NEXT_PUBLIC_CASHFREE_CLIENT_SECRET/);
  assert.doesNotMatch(message, new RegExp(secret));
});

test("accepts complete optional integration groups without requiring them globally", () => {
  const env = parseServerEnv({
    MONGODB_URI: "mongodb://127.0.0.1:27017/moneytreeventures",
    MONGODB_DB_NAME: "moneytreeventures_test",
  });

  assert.equal(env.MONGODB_DB_NAME, "moneytreeventures_test");
});

test("Resend cannot be partially enabled without its sender and canonical app URL", () => {
  const error = captureError({ RESEND_API_KEY: "re_placeholder_only", EMAIL_FROM: "noreply@example.invalid" });
  assert.match(error, /APP_URL: is required when Resend email configuration is provided/);
});

test("staging app URL can be configured without enabling Resend delivery", () => {
  const env = parseServerEnv({ NODE_ENV: "production", APP_URL: "https://staging.example.invalid" });
  assert.equal(env.APP_URL, "https://staging.example.invalid");
  assert.equal(env.RESEND_API_KEY, undefined);
  assert.equal(env.EMAIL_FROM, undefined);
  assert.match(captureError({ APP_URL: "https://staging.example.invalid", RESEND_API_KEY: "test-key" }), /EMAIL_FROM: is required when Resend email configuration is provided/);
});

test("private PDF R2 settings do not opt into the separate public-media configuration", () => {
  const env = parseServerEnv({
    R2_ACCOUNT_ID: "a".repeat(32), R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
    R2_BUCKET_NAME: "private-pdf", R2_ACCESS_KEY_ID: "private-key", R2_SECRET_ACCESS_KEY: "private-secret",
  });
  assert.equal(env.R2_BUCKET_NAME, "private-pdf");
  assert.equal(env.R2_PUBLIC_MEDIA_BUCKET_NAME, undefined);
});

test("enabling public media requires the shared R2 endpoint and complete media-only settings", () => {
  const message = captureError({ R2_PUBLIC_MEDIA_ACCESS_KEY_ID: "media-key" });
  assert.match(message, /R2_PUBLIC_MEDIA_SECRET_ACCESS_KEY: is required/);
  assert.match(message, /R2_ACCOUNT_ID: is required when public product media configuration is provided/);
  assert.match(message, /R2_ENDPOINT: is required when public product media configuration is provided/);
});

test("marks the server configuration module with Next.js server-only protection", () => {
  for (const path of ["src/lib/env/server.ts", "src/lib/env/schema.ts"]) {
    const source = readFileSync(path, "utf8");

    assert.match(source, /^import ["']server-only["'];/);
  }
});

test("the server configuration cannot be loaded under the default client condition", () => {
  const result = spawnSync(
    process.execPath,
    ["-e", "require('./.test-build/src/lib/env/server.js')"],
    { encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot be imported from a Client Component module/i);
});

test("Next.js server startup validates configured values only in the Node runtime", async () => {
  const originalRuntime = process.env.NEXT_RUNTIME;
  const originalMongoUri = process.env.MONGODB_URI;
  const originalMongoDbName = process.env.MONGODB_DB_NAME;

  try {
    process.env.NEXT_RUNTIME = "nodejs";
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test";
    delete process.env.MONGODB_DB_NAME;

    await assert.rejects(register(), /MONGODB_DB_NAME: is required/);

    process.env.NEXT_RUNTIME = "edge";
    process.env.MONGODB_URI = "not-a-mongodb-uri";
    await assert.doesNotReject(register());
  } finally {
    if (originalRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = originalRuntime;

    if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongoUri;

    if (originalMongoDbName === undefined) delete process.env.MONGODB_DB_NAME;
    else process.env.MONGODB_DB_NAME = originalMongoDbName;
  }
});
