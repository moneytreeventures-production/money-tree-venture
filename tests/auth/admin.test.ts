import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AuthorizationError, AuthenticationError } from "../../src/lib/errors/app-error";
import { createAdminAuthorizationUtilities, isAuthorizedOwnerAdmin, resolveAdminRouteAccess, type AdminAuthorizationContext } from "../../src/lib/auth/admin";
import { createAdminApiWrapper } from "../../src/lib/auth/admin-api";
import { createCustomerSessionUtilities, type AuthSession } from "../../src/lib/auth/session";
import type { User } from "../../src/lib/db/models/user";
import type { GoogleAccountIdentity } from "../../src/lib/auth/google-identity";

const ownerEmail = "moneytreeventuress@gmail.com";

function profile(overrides: Partial<User> = {}): User {
  return {
    authUserId: "trusted-auth-id",
    name: "Trusted User",
    email: "trusted@example.com",
    emailNormalized: "trusted@example.com",
    role: "customer",
    status: "active",
    ...overrides,
  };
}

function authorizationContext(options: {
  session?: AdminAuthorizationContext["session"];
  profile?: Partial<User> | null;
  identity?: Partial<GoogleAccountIdentity> | null;
} = {}): AdminAuthorizationContext {
  const defaultProfile = profile({ role: "admin", email: ownerEmail, emailNormalized: ownerEmail, ...(options.profile ?? {}) });
  const defaultIdentity: GoogleAccountIdentity = { email: ownerEmail, emailVerified: true, active: true, providerIds: ["google"] };
  const session = options.session === undefined
    ? { userId: "trusted-auth-id", email: ownerEmail, emailVerified: true }
    : options.session;
  const candidate = options.profile === null ? null : {
    ...defaultProfile,
    authUserId: options.profile?.authUserId ?? session?.userId ?? "trusted-auth-id",
  };
  const identity = options.identity === null
    ? null
    : { ...defaultIdentity, ...(options.identity ?? {}) };
  return { session, profile: candidate, googleIdentity: identity };
}

test("no or invalid verified session cannot obtain an administrator", async () => {
  const admin = createAdminAuthorizationUtilities(async () => authorizationContext({ session: null, profile: null, identity: null }));
  assert.equal(await admin.getCurrentAdmin(), null);
  await assert.rejects(admin.requireAdmin(), AuthenticationError);
  assert.equal(await resolveAdminRouteAccess(admin.requireAdmin), "authentication");
});

test("owner access requires the verified Google identity and active admin role", async () => {
  const accepted = authorizationContext();
  assert.equal(isAuthorizedOwnerAdmin(accepted), true);
  const admin = createAdminAuthorizationUtilities(async () => accepted);
  assert.equal(await admin.getCurrentAdmin(), accepted.profile);
  assert.equal(await admin.requireAdmin(), accepted.profile);
  assert.equal(await resolveAdminRouteAccess(admin.requireAdmin), "allowed");
});

test("owner identity without admin role, verification, or an unambiguous Google link is denied", async () => {
  const deniedContexts = [
    authorizationContext({ profile: { role: "customer" } }),
    authorizationContext({ session: { userId: "trusted-auth-id", email: ownerEmail, emailVerified: false } }),
    authorizationContext({ identity: { emailVerified: false } }),
    authorizationContext({ identity: { providerIds: ["google", "google"] } }),
    authorizationContext({ identity: { providerIds: ["github"] } }),
  ];
  for (const context of deniedContexts) {
    const admin = createAdminAuthorizationUtilities(async () => context);
    assert.equal(await admin.getCurrentAdmin(), null);
    await assert.rejects(admin.requireAdmin(), AuthorizationError);
  }
});

test("other emails and manipulated identity/profile values cannot obtain admin access", async () => {
  const deniedContexts = [
    authorizationContext({ identity: { email: "attacker@example.com" } }),
    authorizationContext({ session: { userId: "trusted-auth-id", email: "attacker@example.com", emailVerified: true } }),
    authorizationContext({ profile: { emailNormalized: "attacker@example.com" } }),
    authorizationContext({ profile: { authUserId: "different-user-id" } }),
  ];
  for (const context of deniedContexts) assert.equal(isAuthorizedOwnerAdmin(context), false);
});

test("inactive profiles are denied and role revocation is observed on the next check", async () => {
  for (const candidate of [
    authorizationContext({ profile: { role: "customer" } }),
    authorizationContext({ profile: { status: "blocked" } }),
    authorizationContext({ profile: { status: "deleted" } }),
  ]) {
    const admin = createAdminAuthorizationUtilities(async () => candidate);
    assert.equal(await admin.getCurrentAdmin(), null);
    await assert.rejects(admin.requireAdmin(), AuthorizationError);
    assert.equal(await resolveAdminRouteAccess(admin.requireAdmin), "authorization");
  }
});

test("browser role, email, or user ID values cannot influence the server identity decision", async () => {
  let provisionedId = "";
  const trustedSession = {
    session: {} as NonNullable<AuthSession>["session"],
    user: { id: "session-customer-id", name: "Customer", email: "customer@example.com", emailVerified: true },
  } as AuthSession;
  const sessionUtilities = createCustomerSessionUtilities(async () => trustedSession, async (identity) => {
    provisionedId = identity.id;
    return profile({ authUserId: identity.id, role: "customer" });
  });
  const admin = createAdminAuthorizationUtilities(async () => ({
    session: { userId: "session-customer-id", email: "customer@example.com", emailVerified: true },
    profile: await sessionUtilities.getCurrentApplicationProfile(),
    googleIdentity: { email: "customer@example.com", emailVerified: true, active: true, providerIds: ["google"] },
  }));
  const untrustedRequest = new Request("https://example.test/api/admin?userId=trusted-auth-id&role=admin", {
    headers: { "x-user-id": "trusted-auth-id", "x-role": "admin" },
  });
  assert.equal(await admin.getCurrentAdmin(), null);
  assert.equal(provisionedId, "session-customer-id");
  assert.equal(untrustedRequest.headers.get("x-role"), "admin");
  assert.equal(await admin.getCurrentAdmin(), null);
});

test("admin API wrapper enforces authorization, preserves HTTP status and safe request IDs", async () => {
  let called = false;
  const unauthorizedRoute = createAdminApiWrapper(async () => { throw new AuthenticationError(); })(async () => {
    called = true;
    return Response.json({ success: true });
  });
  const response = await unauthorizedRoute(new Request("https://example.test/api/admin"), undefined);
  const body = await response.json() as { error: { code: string }; requestId: string };
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
  assert.match(body.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(called, false);

  const forbiddenRoute = createAdminApiWrapper(async () => { throw new AuthorizationError(); })(async () => Response.json({}));
  assert.equal((await forbiddenRoute(new Request("https://example.test/api/admin"), undefined)).status, 403);
});

test("admin API defers request-time access before invoking authorization or its catch block", async () => {
  let authorized = false;
  const request = new Request("https://example.test/api/admin/products");
  Object.defineProperty(request, "url", { get() { throw new Error("PRERENDER_BAILOUT"); } });
  const route = createAdminApiWrapper(async () => {
    authorized = true;
    return profile({ role: "admin" });
  })(async () => Response.json({ ok: true }));
  await assert.rejects(route(request, undefined), /PRERENDER_BAILOUT/);
  assert.equal(authorized, false);
});

test("admin API wrapper supplies the trusted admin and route context to authorized handlers", async () => {
  const expected = profile({ role: "admin" });
  const route = createAdminApiWrapper(async () => expected)(async (_request, admin, context: { params: Promise<{ id: string }> }) => {
    assert.equal(admin, expected);
    assert.deepEqual(await context.params, { id: "record-1" });
    return Response.json({ ok: true });
  });
  const response = await route(new Request("https://example.test/api/admin/record-1"), { params: Promise.resolve({ id: "record-1" }) });
  assert.equal(response.status, 200);
});

test("protected admin route redirects anonymous sessions and denies customer profiles", async () => {
  const layout = readFileSync("src/app/admin/layout.tsx", "utf8");
  const bookingsPage = readFileSync("src/app/admin/bookings/page.tsx", "utf8");
  assert.match(layout, /redirect\("\/admin\/login"\)/);
  assert.match(bookingsPage, /redirect\("\/admin\/login"\)/);
  assert.match(layout, /resolveAdminRouteAccess\(requireAdmin\)/);
  assert.equal(await resolveAdminRouteAccess(async () => { throw new AuthenticationError(); }), "authentication");
  assert.equal(await resolveAdminRouteAccess(async () => { throw new AuthorizationError(); }), "authorization");
  assert.match(layout, /Is area ke liye access nahi hai/);
  assert.match(layout, /redirect\("\/admin\/login"\)/);
});

test("admin API mutations use the sole-owner policy and deny customers before handling", async () => {
  let called = false;
  const customerAccess = createAdminAuthorizationUtilities(async () => authorizationContext({ profile: { role: "customer" } }));
  const route = createAdminApiWrapper(customerAccess.requireAdmin)(async () => {
    called = true;
    return Response.json({ ok: true });
  });
  const response = await route(new Request("https://example.test/api/admin/products", { method: "DELETE" }), undefined);
  assert.equal(response.status, 403);
  assert.equal(called, false);
});
