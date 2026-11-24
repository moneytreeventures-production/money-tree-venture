import assert from "node:assert/strict";
import { Types } from "mongoose";
import { test } from "node:test";
import { AuthenticationError, NotFoundError } from "../../src/lib/errors/app-error";
import { createProductRouteHandlers } from "../../src/lib/catalog/product-route-handlers";
import type { User } from "../../src/lib/db/models/user";

const admin = {
  _id: new Types.ObjectId("64b64c000000000000000099"),
  authUserId: "trusted-auth-id",
  name: "Admin",
  email: "admin@example.com",
  emailNormalized: "admin@example.com",
  role: "admin",
  status: "active",
} satisfies User;

function publicProduct() {
  return {
    _id: new Types.ObjectId("64b64c000000000000000001"),
    name: "Public Guide",
    slug: "public-guide",
    shortDescription: "A useful guide",
    description: "Public product description",
    productType: "pdf" as const,
    categoryIds: [],
    pricePaise: 12000,
    currency: "INR" as const,
    imageRefs: ["cover-ref"],
    promotionalVideoUrl: "https://cdn.example.test/promo.mp4",
    features: ["Clear steps"],
    benefits: ["Useful learning"],
    includedContent: [],
    faqs: [{ question: "Question?", answer: "Answer." }],
    publicationStatus: "published" as const,
    featured: false,
    displayOrder: 0,
    includedProductIds: [],
    primaryAssetId: new Types.ObjectId(),
    fulfilmentInstructions: "Internal fulfillment notes",
    archivedBy: new Types.ObjectId(),
  };
}

test("admin product APIs pass trusted actor identity and request data to services", async () => {
  let listQuery: unknown;
  let createInput: unknown;
  let createdBy = "";
  let updateId = "";
  let updateActor = "";
  const handlers = createProductRouteHandlers({
    authorize: async () => admin,
    services: {
      async listProducts(query) { listQuery = query; return { items: [], pagination: { total: 0 } }; },
      async createProduct(input, actorId) { createInput = input; createdBy = actorId; return { id: "new-product" }; },
      async updateProduct(id, _input, actorId) { updateId = id; updateActor = actorId; return { id }; },
      async changeProductStatus(id, _input, actorId) { return { id, actorId }; },
    },
  });

  const listResponse = await handlers.adminCollectionGET(new Request("https://example.test/api/admin/products?productType=pdf&page=2"), undefined);
  assert.equal(listResponse.status, 200);
  assert.deepEqual(listQuery, { productType: "pdf", page: "2" });

  const createResponse = await handlers.adminCollectionPOST(new Request("https://example.test/api/admin/products", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Guide" }),
  }), undefined);
  assert.equal(createResponse.status, 201);
  assert.deepEqual(createInput, { name: "Guide" });
  assert.equal(createdBy, admin._id.toString());

  const updateResponse = await handlers.adminItemPATCH(new Request("https://example.test/api/admin/products/item", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Changed" }),
  }), { params: Promise.resolve({ id: "product-id" }) });
  assert.equal(updateResponse.status, 200);
  assert.equal(updateId, "product-id");
  assert.equal(updateActor, admin._id.toString());
});

test("admin product APIs reject unauthenticated requests before invoking services", async () => {
  let called = false;
  const handlers = createProductRouteHandlers({
    authorize: async () => { throw new AuthenticationError(); },
    services: { async createProduct() { called = true; return {}; } },
  });
  const response = await handlers.adminCollectionPOST(new Request("https://example.test/api/admin/products", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Guide" }),
  }), undefined);
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("admin product listing returns a malformed record unchanged for the UI integrity guard", async () => {
  const malformed = { _id: "legacy-row", title: "Legacy title only", slug: "legacy-row" };
  const handlers = createProductRouteHandlers({
    authorize: async () => admin,
    services: { async listProducts() { return { items: [malformed], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }; } },
  });
  const response = await handlers.adminCollectionGET(new Request("https://example.test/api/admin/products"), undefined);
  const body = await response.json() as { data: { items: Array<Record<string, unknown>> } };
  assert.equal(response.status, 200);
  assert.equal(body.data.items[0].name, undefined);
  assert.equal(body.data.items[0].title, "Legacy title only");
});

test("admin product listing reports a safe service error response", async () => {
  const handlers = createProductRouteHandlers({
    authorize: async () => admin,
    services: { async listProducts() { throw new NotFoundError(); } },
  });
  const response = await handlers.adminCollectionGET(new Request("https://example.test/api/admin/products"), undefined);
  assert.equal(response.status, 404);
  assert.equal((await response.json() as { error: { message: string } }).error.message, "Yeh jaankari nahi mili.");
});

test("admin delete API forwards the trusted admin and blocks unauthorized access", async () => {
  let deletedId = "";
  let actorId = "";
  const handlers = createProductRouteHandlers({
    authorize: async () => admin,
    services: { async deleteProduct(id, actor) { deletedId = id; actorId = actor; } },
  });
  const response = await handlers.adminItemDELETE(new Request("https://example.test/api/admin/products/id", { method: "DELETE" }), { params: Promise.resolve({ id: "64b64c000000000000000001" }) });
  assert.equal(response.status, 200);
  assert.equal(deletedId, "64b64c000000000000000001");
  assert.equal(actorId, admin._id.toString());

  let called = false;
  const denied = createProductRouteHandlers({ authorize: async () => { throw new AuthenticationError(); }, services: { async deleteProduct() { called = true; } } });
  const deniedResponse = await denied.adminItemDELETE(new Request("https://example.test/api/admin/products/id", { method: "DELETE" }), { params: Promise.resolve({ id: "64b64c000000000000000001" }) });
  assert.equal(deniedResponse.status, 401);
  assert.equal(called, false);
});

test("public product API serializes an explicit safe view", async () => {
  const product = publicProduct();
  const handlers = createProductRouteHandlers({
    authorize: async () => admin,
    services: {
      async listPublicProducts() { return { items: [product] as never, pagination: { page: 1, total: 1 } }; },
      async getPublicProductBySlug(slug) { assert.equal(slug, "public-guide"); return product as never; },
    },
  });

  const listResponse = await handlers.publicListGET(new Request("https://example.test/api/products"));
  const listBody = await listResponse.json() as { data: { items: Array<Record<string, unknown>> } };
  const listed = listBody.data.items[0];
  assert.equal(listed.slug, "public-guide");
  assert.equal(listed.promotionalVideoUrl, "https://cdn.example.test/promo.mp4");
  assert.deepEqual(listed.features, ["Clear steps"]);
  assert.deepEqual(listed.faqs, [{ question: "Question?", answer: "Answer." }]);
  assert.equal("primaryAssetId" in listed, false);
  assert.equal("includedProductIds" in listed, false);
  assert.equal("fulfilmentInstructions" in listed, false);
  assert.equal("archivedBy" in listed, false);

  const detailResponse = await handlers.publicItemGET(new Request("https://example.test/api/products/public-guide"), {
    params: Promise.resolve({ slug: "public-guide" }),
  });
  assert.equal(detailResponse.status, 200);
});

test("public endpoint errors retain safe HTTP statuses", async () => {
  const handlers = createProductRouteHandlers({
    services: { async getPublicProductBySlug() { throw new NotFoundError(); } },
  });
  const response = await handlers.publicItemGET(new Request("https://example.test/api/products/unknown"), {
    params: Promise.resolve({ slug: "unknown" }),
  });
  assert.equal(response.status, 404);
});
