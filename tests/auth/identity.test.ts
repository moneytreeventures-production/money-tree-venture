import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthorizationError, AuthenticationError, DatabaseError } from "../../src/lib/errors/app-error";
import {
  createCustomerProfileProvisioner,
  type CustomerProfileStore,
} from "../../src/lib/auth/customer-profile";
import {
  createCustomerSessionUtilities,
  type AuthSession,
} from "../../src/lib/auth/session";
import type { User } from "../../src/lib/db/models/user";

function profile(overrides: Partial<User> = {}): User {
  return {
    authUserId: "better-auth-identity-1",
    name: "A Customer",
    email: "customer@example.com",
    emailNormalized: "customer@example.com",
    role: "customer",
    status: "active",
    ...overrides,
  };
}

function identity(overrides: Partial<{ id: string; name: string; email: string }> = {}) {
  return {
    id: "better-auth-identity-1",
    name: "A Customer",
    email: "Customer@Example.com",
    ...overrides,
  };
}

test("new Better Auth identity creates a normalized customer profile by authUserId", async () => {
  let inserted: unknown;
  const created = profile();
  const store: CustomerProfileStore = {
    async ensureByAuthUserId(seed) { inserted = seed; return created; },
    async findByAuthUserId() { return null; },
  };
  const provision = createCustomerProfileProvisioner(store);

  const result = await provision(identity());
  assert.equal(result, created);
  assert.deepEqual(inserted, {
    authUserId: "better-auth-identity-1",
    name: "A Customer",
    email: "customer@example.com",
    emailNormalized: "customer@example.com",
    role: "customer",
    status: "active",
  });
});

test("returning identity preserves an existing admin role and profile fields", async () => {
  const existing = profile({ role: "admin", status: "active", name: "Existing Admin" });
  let insertedRole: string | undefined;
  const store: CustomerProfileStore = {
    async ensureByAuthUserId(seed) { insertedRole = seed.role; return existing; },
    async findByAuthUserId() { assert.fail("Existing profile should not require fallback lookup"); },
  };

  const maliciousIdentity = {
    ...identity({ name: "Changed Name" }),
    role: "admin",
  } as Parameters<ReturnType<typeof createCustomerProfileProvisioner>>[0];
  const result = await createCustomerProfileProvisioner(store)(maliciousIdentity);

  assert.equal(insertedRole, "customer");
  assert.equal(result.role, "admin");
  assert.equal(result.name, "Existing Admin");
});

test("concurrent upserts recover the unique authUserId duplicate-key race", async () => {
  const existing = profile();
  let attempts = 0;
  let lookups = 0;
  const store: CustomerProfileStore = {
    async ensureByAuthUserId() {
      attempts += 1;
      if (attempts === 1) return existing;
      throw Object.assign(new Error("duplicate key"), { code: 11000 });
    },
    async findByAuthUserId(authUserId) {
      lookups += 1;
      assert.equal(authUserId, existing.authUserId);
      return existing;
    },
  };
  const provision = createCustomerProfileProvisioner(store);
  const results = await Promise.all([provision(identity()), provision(identity())]);

  assert.equal(attempts, 2);
  assert.equal(lookups, 1);
  assert.deepEqual(results, [existing, existing]);
});

test("profile reconciliation never falls back to email and fails closed on database errors", async () => {
  let lookupId = "";
  const store: CustomerProfileStore = {
    async ensureByAuthUserId() { throw Object.assign(new Error("duplicate"), { code: 11000 }); },
    async findByAuthUserId(authUserId) { lookupId = authUserId; return null; },
  };

  await assert.rejects(createCustomerProfileProvisioner(store)(identity()), DatabaseError);
  assert.equal(lookupId, "better-auth-identity-1");

  const failingStore: CustomerProfileStore = {
    async ensureByAuthUserId() { throw new Error("database private detail"); },
    async findByAuthUserId() { return null; },
  };
  await assert.rejects(createCustomerProfileProvisioner(failingStore)(identity()), (error: unknown) => {
    assert.ok(error instanceof DatabaseError);
    assert.doesNotMatch(error.message, /database private detail/);
    return true;
  });
});

function session(userId: string, name = "A Customer", email = "customer@example.com"): AuthSession {
  return {
    session: {} as NonNullable<AuthSession>["session"],
    user: { id: userId, name, email } as NonNullable<AuthSession>["user"],
  } as AuthSession;
}

test("server session utilities return unauthenticated without a session and require a customer for protected work", async () => {
  let provisions = 0;
  const anonymous = createCustomerSessionUtilities(async () => null, async () => {
    provisions += 1;
    return profile();
  });

  assert.equal(await anonymous.getCurrentSession(), null);
  assert.equal(await anonymous.getCurrentCustomer(), null);
  await assert.rejects(anonymous.requireCustomer(), AuthenticationError);
  assert.equal(provisions, 0);
});

test("valid server session resolves only its Better Auth id and reconciles a missing profile", async () => {
  let receivedIdentity: unknown;
  const utilities = createCustomerSessionUtilities(async () => session("trusted-id", "Trusted User", "trusted@example.com"), async (trustedIdentity) => {
    receivedIdentity = trustedIdentity;
    return profile({ authUserId: "trusted-id", name: "Trusted User", email: "trusted@example.com", emailNormalized: "trusted@example.com" });
  });

  assert.equal((await utilities.getCurrentSession())?.user.id, "trusted-id");
  assert.equal((await utilities.getCurrentCustomer())?.authUserId, "trusted-id");
  assert.deepEqual(receivedIdentity, { id: "trusted-id", name: "Trusted User", email: "trusted@example.com" });
});

test("blocked profiles cannot be used as active customers", async () => {
  const utilities = createCustomerSessionUtilities(async () => session("blocked-id"), async () => profile({ authUserId: "blocked-id", status: "blocked" }));
  await assert.rejects(utilities.getCurrentCustomer(), AuthorizationError);
  await assert.rejects(utilities.requireCustomer(), AuthorizationError);
});

test("existing administrator identity is not accepted by customer-only helpers", async () => {
  const utilities = createCustomerSessionUtilities(async () => session("admin-id"), async () => profile({ authUserId: "admin-id", role: "admin" }));
  await assert.rejects(utilities.getCurrentCustomer(), AuthorizationError);
  await assert.rejects(utilities.requireCustomer(), AuthorizationError);
});
