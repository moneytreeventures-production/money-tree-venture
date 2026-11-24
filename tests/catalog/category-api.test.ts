import assert from "node:assert/strict";
import { Types } from "mongoose";
import { test } from "node:test";
import { AuthenticationError } from "../../src/lib/errors/app-error";
import { createAdminCategoryRouteHandlers } from "../../src/lib/catalog/category-route-handlers";
import type { User } from "../../src/lib/db/models/user";

const admin = { _id: new Types.ObjectId(), authUserId: "owner", name: "Admin", email: "admin@example.test", emailNormalized: "admin@example.test", role: "admin", status: "active" } satisfies User;

test("admin category list parses filters and forwards them to the service", async () => {
  let received: unknown;
  const handlers = createAdminCategoryRouteHandlers({
    authorize: async () => admin,
    services: { async listCategories(input) { received = input; return { items: [], pagination: { page: 2, total: 0, totalPages: 0 } }; } },
  });
  const response = await handlers.collectionGET(new Request("https://example.test/api/admin/categories?status=inactive&page=2"), undefined);
  assert.equal(response.status, 200);
  assert.deepEqual(received, { status: "inactive", page: "2" });
  assert.deepEqual(await response.json(), { success: true, data: { items: [], pagination: { page: 2, total: 0, totalPages: 0 } } });
});

test("unauthorized category list is rejected before calling the service", async () => {
  let called = false;
  const handlers = createAdminCategoryRouteHandlers({
    authorize: async () => { throw new AuthenticationError(); },
    services: { async listCategories() { called = true; return {}; } },
  });
  const response = await handlers.collectionGET(new Request("https://example.test/api/admin/categories"), undefined);
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("category create, update and lifecycle handlers pass payloads and identifiers", async () => {
  const calls: unknown[] = [];
  const handlers = createAdminCategoryRouteHandlers({
    authorize: async () => admin,
    services: {
      async createCategory(input) { calls.push(["create", input]); return { id: "created" }; },
      async updateCategory(id, input) { calls.push(["update", id, input]); return { id }; },
      async changeCategoryStatus(id, input) { calls.push(["status", id, input]); return { id }; },
    },
  });
  const post = (url: string, body: unknown, method = "POST") => new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const created = await handlers.collectionPOST(post("https://example.test/api/admin/categories", { name: "Guides" }), undefined);
  assert.equal(created.status, 201);
  await handlers.itemPATCH(post("https://example.test/api/admin/categories/id", { name: "Updated" }, "PATCH"), { params: Promise.resolve({ id: "id" }) });
  await handlers.statusPATCH(post("https://example.test/api/admin/categories/id/status", { status: "inactive" }, "PATCH"), { params: Promise.resolve({ id: "id" }) });
  assert.deepEqual(calls, [["create", { name: "Guides" }], ["update", "id", { name: "Updated" }], ["status", "id", { status: "inactive" }]]);
});
