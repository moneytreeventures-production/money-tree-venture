import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEmailTestMessage, emailTestPolicy, hasEmailTestRateIndex } from "../../src/lib/email/email-testing";

test("testing is disabled unless staging host and explicit flag are present", () => {
  const base = { appUrl: "https://staging.moneytreeventure.com", authUrl: "https://staging.moneytreeventure.com", database: "moneytreeventures_staging", localDatabase: "moneytreeventures_staging", localRole: "staging-only", allowed: "owner@example.test", recipient: "owner@example.test" };
  assert.equal(emailTestPolicy(base), "disabled");
  assert.equal(emailTestPolicy({ ...base, enabled: "true", appUrl: "https://moneytreeventure.com" }), "wrong_environment");
  assert.equal(emailTestPolicy({ ...base, enabled: "true", appUrl: "invalid" }), "wrong_environment");
  assert.equal(emailTestPolicy({ ...base, enabled: "true" }), "allowed");
  assert.equal(emailTestPolicy({ ...base, enabled: "true", appUrl: "https://preview.example.test", authUrl: "https://preview.example.test" }), "allowed");
  assert.equal(emailTestPolicy({ ...base, enabled: "true", localRole: undefined }), "wrong_environment");
  assert.equal(emailTestPolicy({ ...base, enabled: "true", authUrl: "https://other.example.test" }), "wrong_environment");
  const local = { ...base, enabled: "true", appUrl: "http://localhost:3000", authUrl: "http://localhost:3000", database: "moneytreeventures", localDatabase: "moneytreeventures", localRole: "local-development-only", nodeEnv: "development" };
  assert.equal(emailTestPolicy(local), "allowed");
  assert.equal(emailTestPolicy({ ...local, localRole: undefined }), "wrong_environment");
  assert.equal(emailTestPolicy({ ...local, authUrl: "https://moneytreeventure.com" }), "wrong_environment");
  assert.equal(emailTestPolicy({ ...local, localDatabase: "moneytreeventures_staging" }), "wrong_environment");
  assert.equal(emailTestPolicy({ ...local, database: "another_database", localDatabase: "another_database" }), "wrong_environment");
  assert.equal(emailTestPolicy({ ...local, nodeEnv: "production" }), "wrong_environment");
  assert.equal(emailTestPolicy({ ...local, netlify: "true" }), "wrong_environment");
});

test("recipient allowlist is exact and rejects malformed addresses", () => {
  const base = { enabled: "true", appUrl: "https://staging.moneytreeventure.com", authUrl: "https://staging.moneytreeventure.com", database: "moneytreeventures_staging", localDatabase: "moneytreeventures_staging", localRole: "staging-only", allowed: "one@example.test, two@example.test" };
  assert.equal(emailTestPolicy({ ...base, recipient: " ONE@example.test " }), "allowed");
  assert.equal(emailTestPolicy({ ...base, recipient: "other@example.test" }), "recipient_not_allowed");
  assert.equal(emailTestPolicy({ ...base, recipient: "one@example.test.evil" }), "recipient_not_allowed");
  assert.equal(emailTestPolicy({ ...base, recipient: "not-an-email" }), "invalid_recipient");
});

test("email-test quota requires the exact unique rate index", () => {
  const valid = { name: "identityHash_1_windowStart_1", key: { identityHash: 1, windowStart: 1 }, unique: true };
  assert.equal(hasEmailTestRateIndex([valid]), true);
  assert.equal(hasEmailTestRateIndex([{ ...valid, unique: false }]), false);
  assert.equal(hasEmailTestRateIndex([{ ...valid, key: { identityHash: 1 } }]), false);
  assert.equal(hasEmailTestRateIndex([{ ...valid, partialFilterExpression: { count: { $gt: 0 } } }]), false);
  assert.equal(hasEmailTestRateIndex([]), false);
});

test("synthetic template contains no customer or private download data", () => {
  const basic = buildEmailTestMessage("basic", "abc", "https://preview.example.test/account");
  const purchase = buildEmailTestMessage("purchase", "abc", "https://preview.example.test/account");
  assert.match(basic.subject, /TEST EMAIL/);
  assert.match(purchase.subject, /TEST EMAIL/);
  assert.match(purchase.text, /Sample PDF \(test only\)/);
  assert.match(purchase.text, /No purchase was made/);
  assert.equal(purchase.to, "");
  assert.doesNotMatch(purchase.html, /r2\.dev|download\/|token=/i);
  const local = buildEmailTestMessage("purchase", "abc", "http://localhost:3000/account");
  assert.match(local.text, /http:\/\/localhost:3000\/account/);
});
