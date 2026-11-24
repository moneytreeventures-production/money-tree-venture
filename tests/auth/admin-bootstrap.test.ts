import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { AuthorizationError, NotFoundError, ValidationError } from "../../src/lib/errors/app-error";
import { createAdminBootstrap, type AdminBootstrapStore } from "../../src/lib/auth/admin-bootstrap";
import { assertNonProductionBootstrap, parseAdminBootstrapArgs } from "../../scripts/bootstrap-admin";
import type { User } from "../../src/lib/db/models/user";
import type { GoogleAccountIdentity } from "../../src/lib/auth/google-identity";

const authUserId = "64b64c000000000000000001";
function profile(overrides: Partial<User> = {}): User {
  return {
    authUserId,
    name: "Existing Name",
    email: "moneytreeventuress@gmail.com",
    emailNormalized: "moneytreeventuress@gmail.com",
    role: "customer",
    status: "active",
    imageRef: "private-profile-image-ref",
    ...overrides,
  };
}

const ownerIdentity: GoogleAccountIdentity = {
  email: "moneytreeventuress@gmail.com",
  emailVerified: true,
  active: true,
  providerIds: ["google"],
};

function storeFixture(initial: User | null, identity: GoogleAccountIdentity | null = ownerIdentity) {
  let current = initial;
  let auditCount = 0;
  const store: AdminBootstrapStore = {
    async getAuthIdentity(id) { assert.equal(id, authUserId); return identity; },
    async findProfile(id) { assert.equal(id, authUserId); return current; },
    async promoteActiveProfileAndAudit(id) {
      assert.equal(id, authUserId);
      if (!current || current.status !== "active") return null;
      if (current.role === "admin") return { profile: current, promoted: false };
      current = { ...current, role: "admin" };
      auditCount += 1;
      return { profile: current, promoted: true };
    },
  };
  return { store, get current() { return current; }, get auditCount() { return auditCount; } };
}

test("bootstrap requires an explicit confirmation before querying identities or profiles", async () => {
  let calls = 0;
  const service = createAdminBootstrap({
    async getAuthIdentity() { calls += 1; return ownerIdentity; },
    async findProfile() { calls += 1; return profile(); },
    async promoteActiveProfileAndAudit() { calls += 1; return null; },
  });
  await assert.rejects(service({ authUserId, confirmed: false }), ValidationError);
  assert.equal(calls, 0);
  assert.deepEqual(parseAdminBootstrapArgs(["--user-id", authUserId, "--confirm-promote-admin", "--confirm-non-production"]), { authUserId, confirmed: true });
  assert.throws(() => parseAdminBootstrapArgs(["--user-id", authUserId]), /Usage:/);
  assert.throws(() => parseAdminBootstrapArgs(["--user-id", authUserId, "--confirm-promote-admin"]), /confirm-non-production/);
  assert.doesNotThrow(() => assertNonProductionBootstrap("development"));
  assert.throws(() => assertNonProductionBootstrap("production"), /disabled/);
});

test("unknown Better Auth identity and missing application profile are rejected", async () => {
  const unknown = storeFixture(null, null);
  await assert.rejects(createAdminBootstrap(unknown.store)({ authUserId, confirmed: true }), NotFoundError);

  const missingProfile = storeFixture(null, ownerIdentity);
  await assert.rejects(createAdminBootstrap(missingProfile.store)({ authUserId, confirmed: true }), NotFoundError);
});

test("bootstrap rejects non-owner, unverified, inactive, unlinked, and ambiguous identities", async () => {
  const deniedIdentities: GoogleAccountIdentity[] = [
    { ...ownerIdentity, email: "other@example.com" },
    { ...ownerIdentity, emailVerified: false },
    { ...ownerIdentity, active: false },
    { ...ownerIdentity, providerIds: [] },
    { ...ownerIdentity, providerIds: ["google", "google"] },
  ];
  for (const identity of deniedIdentities) {
    const fixture = storeFixture(profile(), identity);
    await assert.rejects(createAdminBootstrap(fixture.store)({ authUserId, confirmed: true }), AuthorizationError);
    assert.equal(fixture.auditCount, 0);
  }

  const wrongProfile = storeFixture(profile({ emailNormalized: "other@example.com" }));
  await assert.rejects(createAdminBootstrap(wrongProfile.store)({ authUserId, confirmed: true }), AuthorizationError);
  assert.equal(wrongProfile.auditCount, 0);
});

test("blocked and deleted profiles are rejected without promotion", async () => {
  for (const status of ["blocked", "deleted"] as const) {
    const fixture = storeFixture(profile({ status }));
    await assert.rejects(createAdminBootstrap(fixture.store)({ authUserId, confirmed: true }), AuthorizationError);
    assert.equal(fixture.auditCount, 0);
  }
});

test("promotion changes only the role, records one audit event, and is safely repeatable", async () => {
  const fixture = storeFixture(profile());
  const bootstrap = createAdminBootstrap(fixture.store);
  const first = await bootstrap({ authUserId, confirmed: true });
  assert.equal(first.promoted, true);
  assert.equal(first.profile.role, "admin");
  assert.equal(first.profile.status, "active");
  assert.equal(first.profile.name, "Existing Name");
  assert.equal(first.profile.email, "moneytreeventuress@gmail.com");
  assert.equal(first.profile.imageRef, "private-profile-image-ref");
  assert.equal(fixture.auditCount, 1);

  const repeated = await bootstrap({ authUserId, confirmed: true });
  assert.equal(repeated.promoted, false);
  assert.equal(repeated.profile.role, "admin");
  assert.equal(fixture.auditCount, 1);
});

test("bootstrap is server-only and no public promotion endpoint exists", () => {
  assert.equal(existsSync("src/app/api/admin/bootstrap"), false);
});
