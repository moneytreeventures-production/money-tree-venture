import assert from "node:assert/strict";
import { test } from "node:test";
import { getAccountNavigationDecision } from "../../src/lib/auth/account-navigation";

test("account navigation defaults to the customer account until admin is server-authorized", () => {
  assert.deepEqual(getAccountNavigationDecision(false), { label: "Account", href: "/account" });
});

test("server-authorized owner receives the admin destination", () => {
  assert.deepEqual(getAccountNavigationDecision(true), { label: "Admin Panel", href: "/admin" });
});
