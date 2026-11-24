import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { parseServerEnv } from "../../src/lib/env/schema";
import { IntegrationConfigurationError } from "../../src/lib/errors/app-error";
import {
  createSafeBetterAuthLogger,
  createBetterAuthOptions,
  resolveBetterAuthConfiguration,
} from "../../src/lib/auth/config";
import { createLazyAuth } from "../../src/lib/auth/auth";
import { invokeGoogleSignIn, invokeSignOut, resolveLoginCallbackURL, resolveLoginViewState } from "../../src/lib/auth/client-actions";

const secret = "test-only-better-auth-secret-long-enough";
const localEnv = {
  NODE_ENV: "test",
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
};

test("Better Auth configuration resolves the required Google credentials without exposing them in errors", () => {
  const env = parseServerEnv(localEnv);
  assert.equal(env.GOOGLE_CLIENT_ID, "test-google-client-id");
  assert.equal(env.GOOGLE_CLIENT_SECRET, "test-google-client-secret");
  assert.deepEqual(resolveBetterAuthConfiguration(env), {
    secret,
    googleClientId: "test-google-client-id",
    googleClientSecret: "test-google-client-secret",
    baseURL: "http://localhost:3000",
    trustedOrigin: "http://localhost:3000",
    useSecureCookies: false,
  });

  assert.throws(
    () => resolveBetterAuthConfiguration(parseServerEnv({ NODE_ENV: "production" })),
    (error: unknown) => {
      assert.ok(error instanceof IntegrationConfigurationError);
      assert.equal(error.code, "BETTER_AUTH_CONFIGURATION_ERROR");
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

test("Google OAuth configuration is required and missing names are reported without values", () => {
  const env = parseServerEnv({ NODE_ENV: "test", BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: "http://localhost:3000" });
  assert.throws(() => resolveBetterAuthConfiguration(env), (error: unknown) => {
    assert.ok(error instanceof IntegrationConfigurationError);
    assert.match(error.message, /required configuration is incomplete/);
    assert.deepEqual(error.details?.map((item) => item.field), ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
    assert.doesNotMatch(error.message, /test-google|secret/);
    return true;
  });
});

test("production requires an HTTPS base URL and keeps cookies secure", () => {
  const invalid = parseServerEnv({
    ...localEnv,
    NODE_ENV: "production",
    BETTER_AUTH_URL: "http://moneytreeventure.com",
  });
  assert.throws(() => resolveBetterAuthConfiguration(invalid), IntegrationConfigurationError);

  const config = resolveBetterAuthConfiguration(parseServerEnv({
    ...localEnv,
    NODE_ENV: "production",
    BETTER_AUTH_URL: "https://moneytreeventure.com",
  }));
  assert.equal(config.useSecureCookies, true);
});

test("Better Auth uses separate Mongo collections, the existing client, and safe cookie defaults", async () => {
  const config = resolveBetterAuthConfiguration(parseServerEnv(localEnv));
  const fakeDb = {} as Parameters<typeof mongodbAdapter>[0];
  const fakeClient = {} as NonNullable<Parameters<typeof mongodbAdapter>[1]>["client"];
  const options = createBetterAuthOptions(config, fakeDb, fakeClient);

  assert.equal(typeof options.database, "function");
  assert.equal(options.appName, "MoneyTreeVentures");
  assert.equal(options.user?.modelName, "authUsers");
  assert.equal(options.session?.modelName, "authSessions");
  assert.equal(options.account?.modelName, "authAccounts");
  assert.equal(options.verification?.modelName, "authVerifications");
  assert.notEqual(options.user?.modelName, "users");
  assert.equal(options.emailAndPassword?.enabled, false);
  const configuredGoogleProvider = options.socialProviders?.google;
  assert.ok(configuredGoogleProvider);
  const googleProvider = typeof configuredGoogleProvider === "function"
    ? await configuredGoogleProvider()
    : configuredGoogleProvider;
  assert.equal(googleProvider.clientId, "test-google-client-id");
  assert.equal(googleProvider.clientSecret, "test-google-client-secret");
  assert.deepEqual(googleProvider.scope, ["openid", "email", "profile"]);
  assert.equal(options.advanced?.useSecureCookies, false);
  assert.deepEqual(options.advanced?.defaultCookieAttributes, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });
});

test("Better Auth user creation hook provisions only the trusted identity fields", async () => {
  let provisioned: unknown;
  const config = resolveBetterAuthConfiguration(parseServerEnv(localEnv));
  const options = createBetterAuthOptions(
    config,
    {} as Parameters<typeof mongodbAdapter>[0],
    {} as NonNullable<Parameters<typeof mongodbAdapter>[1]>["client"],
    async (identity) => {
      provisioned = identity;
      return {} as never;
    },
  );
  const afterCreate = options.databaseHooks?.user?.create?.after;
  assert.ok(afterCreate);
  await afterCreate({
    id: "better-auth-user-1",
    name: "Customer",
    email: "customer@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, null);
  assert.deepEqual(provisioned, { id: "better-auth-user-1", name: "Customer", email: "customer@example.com" });
});

test("Better Auth internal logs omit messages and diagnostics that could contain credentials", () => {
  const entries: unknown[] = [];
  const safeLogger = createSafeBetterAuthLogger((_level, message, fields) => entries.push({ message, ...fields }));
  safeLogger.log("error", "request failed token=secret-value", new Error("database URI mongodb://secret-value"));
  safeLogger.log("info", "ordinary internal message");

  assert.equal(entries.length, 1);
  assert.doesNotMatch(JSON.stringify(entries), /secret-value|request failed/);
  assert.deepEqual(entries[0], {
    message: "better-auth.internal",
    provider: "better-auth",
    errorName: "Error",
  });
});

test("lazy auth initialization is shared and a failed initialization can be retried", async () => {
  let attempts = 0;
  const authObject = { marker: "initialized" };
  const getAuth = createLazyAuth(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary failure");
    return authObject;
  });

  await assert.rejects(getAuth(), /temporary failure/);
  assert.equal(attempts, 1);
  const [first, second] = await Promise.all([getAuth(), getAuth()]);
  assert.equal(first, authObject);
  assert.equal(second, authObject);
  assert.equal(attempts, 2);
});

test("auth modules are server-only and importing them does not connect to MongoDB", () => {
  for (const path of ["src/lib/auth/auth.ts", "src/lib/auth/config.ts"]) {
    assert.match(readFileSync(path, "utf8"), /^import ["']server-only["'];/);
  }
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "-e", "const m=require('mongoose'); require('./.test-build/src/lib/auth/auth.js'); if(m.connection.readyState!==0) process.exit(4)"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("App Router auth endpoint uses the official Better Auth handler exports", () => {
  const route = readFileSync("src/app/api/auth/[...all]/route.ts", "utf8");
  assert.match(route, /from ["']better-auth\/next-js["']/);
  assert.match(route, /toNextJsHandler\(auth\)/);
  assert.match(route, /export function GET\(/);
  assert.match(route, /export function POST\(/);
  assert.doesNotMatch(route, /export const runtime/);
});

test("client actions call only Google sign-in and sign-out and expose safe UI states", async () => {
  let received: unknown;
  assert.equal(resolveLoginViewState({ isPending: true, hasError: true, hasSession: true }), "loading");
  assert.equal(resolveLoginViewState({ isPending: false, hasError: true, hasSession: false }), "unavailable");
  assert.equal(resolveLoginViewState({ isPending: false, hasError: false, hasSession: true }), "authenticated");
  assert.equal(resolveLoginViewState({ isPending: false, hasError: false, hasSession: false }), "anonymous");

  assert.equal(await invokeGoogleSignIn(async (options) => { received = options; return {}; }), true);
  assert.deepEqual(received, {
    provider: "google",
    callbackURL: "/",
    errorCallbackURL: "/login?authError=google",
  });
  assert.equal(resolveLoginCallbackURL("/checkout"), "/checkout");
  assert.equal(resolveLoginCallbackURL("/admin", "customer"), "/");
  assert.equal(resolveLoginCallbackURL("https://attacker.example", "admin"), "/admin");
  assert.equal(resolveLoginCallbackURL("https://attacker.example"), "/");
  assert.equal(resolveLoginCallbackURL("//attacker.example"), "/");
  assert.equal(await invokeGoogleSignIn(async (options) => { received = options; return {}; }, "/checkout"), true);
  assert.deepEqual(received, {
    provider: "google",
    callbackURL: "/checkout",
    errorCallbackURL: "/login?authError=google&next=%2Fcheckout",
  });
  assert.equal(await invokeGoogleSignIn(async (options) => { received = options; return {}; }, resolveLoginCallbackURL("/anything", "admin")), true);
  assert.deepEqual(received, {
    provider: "google",
    callbackURL: "/admin",
    errorCallbackURL: "/admin/login?authError=google",
  });
  assert.equal(await invokeGoogleSignIn(async () => { throw new Error("private provider detail"); }), false);

  let signOutCalls = 0;
  assert.equal(await invokeSignOut(async () => { signOutCalls += 1; return {}; }), true);
  assert.equal(await invokeSignOut(async () => ({ error: new Error("private provider detail") })), false);
  assert.equal(signOutCalls, 1);

  const clientSource = readFileSync("src/lib/auth/client.ts", "utf8");
  assert.match(clientSource, /better-auth\/react/);
  assert.doesNotMatch(clientSource, /GOOGLE_CLIENT_SECRET|process\.env/);
});

test("customer and admin login routes reuse Google OAuth without replacing its callback", () => {
  const userPage = readFileSync("src/app/login/page.tsx", "utf8");
  const adminPage = readFileSync("src/app/(public)/admin/login/page.tsx", "utf8");
  const loginPanel = readFileSync("src/components/auth/login-panel.tsx", "utf8");
  const authRoute = readFileSync("src/app/api/auth/[...all]/route.ts", "utf8");
  const publicAdminRoute = "src/app/(public)/admin/login/page.tsx";

  assert.ok(userPage.indexOf("<LoginPanel />") < userPage.indexOf("href=\"/admin/login\""));
  assert.match(userPage, /Admin Login/);
  assert.match(adminPage, /<h1[^>]*>Admin Login<\/h1>/);
  assert.match(adminPage, /Back to User Login/);
  assert.match(adminPage, /<LoginPanel intent="admin" \/>/);
  assert.match(loginPanel, /Continue with Google/);
  assert.match(loginPanel, /sessionCheckTimeoutMs = 10_000/);
  assert.match(loginPanel, /Check session again/);
  assert.match(loginPanel, /callbackURL = resolveLoginCallbackURL\(searchParams\.get\("next"\), intent\)/);
  assert.match(loginPanel, /callbackURL === "\/admin"/);
  assert.match(authRoute, /toNextJsHandler\(auth\)/);
  assert.equal(readFileSync(publicAdminRoute, "utf8").includes("AdminLoginPage"), true);
  assert.equal(existsSync("src/app/admin/login/page.tsx"), false);
});

test("customer and admin logout controls call Better Auth and fully leave protected routes", () => {
  const logout = readFileSync("src/components/auth/sign-out-button.tsx", "utf8");
  const account = readFileSync("src/app/account/page.tsx", "utf8");
  const accountShell = readFileSync("src/components/account/account-shell.tsx", "utf8");
  const adminLayout = readFileSync("src/app/admin/layout.tsx", "utf8");
  assert.match(logout, /invokeSignOut\(\(\) => authClient\.signOut\(\)\)/);
  assert.match(logout, /window\.location\.replace\(redirectTo\)/);
  assert.match(logout, /disabled=\{pending\}/);
  assert.match(logout, /role="alert"/);
  assert.match(account, /<AccountShell /);
  assert.match(accountShell, /<SignOutButton redirectTo="\/" \/>/);
  assert.match(adminLayout, /<SignOutButton compact redirectTo="\/" \/>/);
  assert.doesNotMatch(logout, /clearGuestCart/);
});

test("production auth requests fail with a safe 503 when required configuration is absent", () => {
  const script = [
    "delete process.env.BETTER_AUTH_SECRET;",
    "delete process.env.BETTER_AUTH_URL;",
    "delete process.env.MONGODB_URI;",
    "delete process.env.MONGODB_DB_NAME;",
    "process.env.NODE_ENV='production';",
    "const mongoose=require('mongoose');",
    "const route=require('./.test-build/src/app/api/auth/[...all]/route.js');",
    "route.GET(new Request('https://moneytreeventure.com/api/auth/get-session')).then(async response=>{",
    "const body=await response.text();",
    "if(response.status!==503||!body.includes('BETTER_AUTH_CONFIGURATION_ERROR')||body.includes('test-secret')||mongoose.connection.readyState!==0) process.exit(5);",
    "console.log(response.status);",
    "}).catch(()=>process.exit(6));",
  ].join(" ");
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "-e", script],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /503/);
});
