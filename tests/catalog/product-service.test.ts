import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { test, type TestContext } from "node:test";
import * as mongodb from "../../src/lib/db/mongodb";
import { AuditLogModel, BookingModel, CategoryModel, CouponModel, OrderModel, OutboxEventModel, ProductAssetModel, ProductModel, PurchaseModel } from "../../src/lib/db/models";
import { changeProductStatus, createProduct, deleteProduct, getProductById, getPublicProductBySlug, getPublicProductPageData, listProducts, listPublicProducts, updateProduct } from "../../src/lib/catalog/product-service";
import { ConflictError, NotFoundError, ValidationError } from "../../src/lib/errors/app-error";

const adminId = "64b64c000000000000000099";

function replaceMethod(t: TestContext, target: object, methodName: string, implementation: (...args: never[]) => unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(target, methodName);
  Object.defineProperty(target, methodName, { configurable: true, writable: true, value: implementation });
  t.after(() => descriptor ? Object.defineProperty(target, methodName, descriptor) : Reflect.deleteProperty(target, methodName));
}

function mockDatabase(t: TestContext) {
  const auditEvents: Array<Record<string, unknown>> = [];
  let committedTransactions = 0;
  replaceMethod(t, mongodb, "connectToDatabase", async () => undefined);
  replaceMethod(t, mongoose.connection, "getClient", () => ({
    startSession: () => ({
      async withTransaction(operation: () => Promise<void>) { await operation(); committedTransactions += 1; },
      async endSession() {},
    }),
  }));
  replaceMethod(t, AuditLogModel, "create", async (events: Array<Record<string, unknown>>) => { auditEvents.push(...events); return events; });
  return { auditEvents, get committedTransactions() { return committedTransactions; } };
}

function mockExists(t: TestContext, result: unknown) {
  replaceMethod(t, ProductModel, "exists", async () => result);
}

function mockSave(t: TestContext, error?: unknown) {
  replaceMethod(t, ProductModel.prototype, "save", async function (this: InstanceType<typeof ProductModel>) {
    if (error) throw error;
    return this;
  });
}

function mockRelationFind(t: TestContext, target: object, result: unknown[]) {
  replaceMethod(t, target, "find", () => {
    const query = {
      select() { return this; },
      lean() { return this; },
      async exec() { return result; },
    };
    return query;
  });
}

function productInput(overrides: Record<string, unknown> = {}) {
  return { name: "Freelance Guide", shortDescription: "A practical guide", productType: "pdf", pricePaise: 19_900, ...overrides };
}

test("creates a draft PDF product with generated slug and server-owned defaults", async (t) => {
  const database = mockDatabase(t);
  mockExists(t, null);
  mockSave(t);
  const product = await createProduct(productInput({ name: "Café Freelance Guide" }), adminId);
  assert.equal(product.slug, "cafe-freelance-guide");
  assert.equal(product.publicationStatus, "draft");
  assert.equal(product.currency, "INR");
  assert.equal(product.productType, "pdf");
  assert.equal(database.committedTransactions, 1);
  assert.equal(database.auditEvents[0].action, "product.created");
  assert.equal((database.auditEvents[0].actorUserId as Types.ObjectId).toString(), adminId);
});

test("creates a PDF bundle with explicit starter-kit discriminator", async (t) => {
  mockDatabase(t);
  mockExists(t, null);
  mockRelationFind(t, ProductModel, [{ _id: new Types.ObjectId("64b64c000000000000000001"), productType: "pdf", publicationStatus: "draft" }]);
  mockSave(t);
  const product = await createProduct(productInput({
    name: "Design Starter Kit", productType: "pdf_bundle", bundleKind: "starter_kit",
    includedProductIds: ["64b64c000000000000000001"],
  }), adminId);
  assert.equal(product.bundleKind, "starter_kit");
  assert.equal(product.includedProductIds.length, 1);
});

test("rejects duplicate slugs before writing and maps unique-index races to conflict", async (t) => {
  mockDatabase(t);
  mockExists(t, { _id: "existing" });
  await assert.rejects(createProduct(productInput({ slug: "freelance-guide" }), adminId), ConflictError);

  mockDatabase(t);
  mockExists(t, null);
  mockSave(t, Object.assign(new Error("duplicate"), { code: 11000 }));
  await assert.rejects(createProduct(productInput(), adminId), ConflictError);
});

test("rejects invalid input before product persistence", async (t) => {
  mockDatabase(t);
  await assert.rejects(createProduct({ ...productInput(), productType: "video" }, adminId), ValidationError);
});

test("updates allowed fields without changing type or publication state", async (t) => {
  mockDatabase(t);
  const product = new ProductModel({ ...productInput(), slug: "freelance-guide" });
  replaceMethod(t, ProductModel, "findById", async () => product);
  mockSave(t);
  const updated = await updateProduct(product._id.toString(), { name: "Updated Guide", pricePaise: 21_000 }, adminId);
  assert.equal(updated.name, "Updated Guide");
  assert.equal(updated.pricePaise, 21_000);
  assert.equal(updated.productType, "pdf");
  assert.equal(updated.publicationStatus, "draft");
});

test("persists multiple selected category references and retains inactive existing references on unrelated edits", async (t) => {
  mockDatabase(t);
  const firstCategoryId = new Types.ObjectId();
  const secondCategoryId = new Types.ObjectId();
  const product = new ProductModel({ ...productInput(), slug: "multi-category-guide", categoryIds: [firstCategoryId, secondCategoryId] });
  replaceMethod(t, ProductModel, "findById", async () => product);
  mockRelationFind(t, CategoryModel, [
    { _id: firstCategoryId, status: "active" },
    { _id: secondCategoryId, status: "inactive" },
  ]);
  mockSave(t);
  const updated = await updateProduct(product._id.toString(), { name: "Updated without losing categories" }, adminId);
  assert.deepEqual(updated.categoryIds.map((id) => id.toString()), [firstCategoryId.toString(), secondCategoryId.toString()]);
  const selectedIds = [firstCategoryId.toString(), secondCategoryId.toString(), new Types.ObjectId().toString()];
  const replacement = selectedIds.filter((id) => id !== secondCategoryId.toString());
  mockRelationFind(t, CategoryModel, [{ _id: firstCategoryId, status: "active" }, { _id: new Types.ObjectId(replacement[1]), status: "active" }]);
  const saved = await updateProduct(product._id.toString(), { categoryIds: replacement }, adminId);
  assert.deepEqual(saved.categoryIds.map((id) => id.toString()), replacement);
});

test("turns a concurrent product edit into a safe conflict instead of overwriting category relationships", async (t) => {
  mockDatabase(t);
  const product = new ProductModel({ ...productInput(), slug: "concurrent-category-guide" });
  replaceMethod(t, ProductModel, "findById", async () => product);
  const categoryId = new Types.ObjectId();
  mockRelationFind(t, CategoryModel, [{ _id: categoryId, status: "active" }]);
  mockSave(t, new mongoose.Error.VersionError(product, 0, ["categoryIds"]));
  await assert.rejects(updateProduct(product._id.toString(), { categoryIds: [categoryId.toString()] }, adminId), ConflictError);
});

test("rejects compare-at prices that do not exceed the selling price", async (t) => {
  mockDatabase(t);
  const product = new ProductModel({ ...productInput(), slug: "freelance-guide", compareAtPricePaise: 25000 });
  replaceMethod(t, ProductModel, "findById", async () => product);
  mockSave(t);
  await assert.rejects(updateProduct(product._id.toString(), { pricePaise: 25_000 }, adminId), ValidationError);
  await assert.rejects(updateProduct(product._id.toString(), { compareAtPricePaise: 19_000 }, adminId), ValidationError);
});

test("clears compare-at pricing without changing product identity", async (t) => {
  mockDatabase(t);
  const product = new ProductModel({ ...productInput(), slug: "clear-sale-price", compareAtPricePaise: 25_000 });
  const id = product._id.toString();
  replaceMethod(t, ProductModel, "findById", async () => product);
  mockSave(t);
  const updated = await updateProduct(id, { compareAtPricePaise: null }, adminId);
  assert.equal(updated._id.toString(), id);
  assert.equal(updated.slug, "clear-sale-price");
  assert.equal(updated.compareAtPricePaise, undefined);
});

test("checks update slugs excluding the current product and rejects conflicting changes", async (t) => {
  mockDatabase(t);
  const product = new ProductModel({ ...productInput(), slug: "freelance-guide" });
  replaceMethod(t, ProductModel, "findById", async () => product);
  let checked: Record<string, unknown> | undefined;
  replaceMethod(t, ProductModel, "exists", async (filter: Record<string, unknown>) => { checked = filter; return null; });
  mockSave(t);
  await updateProduct(product._id.toString(), { slug: "new-guide" }, adminId);
  assert.deepEqual(checked, { slug: "new-guide", _id: { $ne: product._id } });

  replaceMethod(t, ProductModel, "exists", async () => ({ _id: "other" }));
  await assert.rejects(updateProduct(product._id.toString(), { slug: "taken" }, adminId), ConflictError);
});

test("returns not found for unknown product and rejects malformed IDs", async (t) => {
  mockDatabase(t);
  replaceMethod(t, ProductModel, "findById", async () => null);
  await assert.rejects(updateProduct("64b64c000000000000000001", { name: "Updated" }, adminId), NotFoundError);
  await assert.rejects(updateProduct("not-an-id", { name: "Updated" }, adminId), ValidationError);
});

test("filters and paginates product listing with escaped search input", async (t) => {
  mockDatabase(t);
  const items = [{ name: "Guide" }];
  let filter: Record<string, unknown> | undefined;
  let sort: Record<string, number> | undefined;
  let skip = -1;
  let limit = -1;
  const query = {
    sort(value: Record<string, number>) { sort = value; return this; },
    skip(value: number) { skip = value; return this; },
    limit(value: number) { limit = value; return this; },
    lean() { return this; },
    async exec() { return items; },
  };
  replaceMethod(t, ProductModel, "find", (value: Record<string, unknown>) => { filter = value; return query; });
  replaceMethod(t, ProductModel, "countDocuments", async () => 21);

  const categoryId = "64b64c000000000000000010";
  const productId = "64b64c000000000000000011";
  const result = await listProducts({ productType: "pdf", publicationStatus: "draft", categoryId, featured: "false", search: "a+b", ids: productId, page: "2", pageSize: "10" });
  assert.equal(skip, 10);
  assert.equal(limit, 10);
  assert.deepEqual(sort, { displayOrder: 1, name: 1, createdAt: -1, _id: 1 });
  assert.equal(filter?.productType, "pdf");
  assert.equal(filter?.publicationStatus, "draft");
  assert.equal((filter?.categoryIds as Types.ObjectId).toString(), categoryId);
  const filteredIds = Object.values(filter?._id as Record<string, Types.ObjectId[]>)[0];
  assert.deepEqual(filteredIds.map(String), [productId]);
  assert.equal(filter?.featured, false);
  assert.deepEqual(filter?.$text, { $search: "a+b" });
  assert.deepEqual(result, { items, pagination: { page: 2, pageSize: 10, total: 21, totalPages: 3 } });
});

test("public listing forces published status and rejects status overrides", async (t) => {
  mockDatabase(t);
  let filter: Record<string, unknown> | undefined;
  const query = {
    sort() { return this; }, skip() { return this; }, limit() { return this; }, lean() { return this; },
    async exec() { return []; },
  };
  replaceMethod(t, ProductModel, "find", (value: Record<string, unknown>) => { filter = value; return query; });
  replaceMethod(t, ProductModel, "countDocuments", async () => 0);
  await listPublicProducts({ productType: "pdf" });
  assert.equal(filter?.publicationStatus, "published");
  await assert.rejects(listPublicProducts({ publicationStatus: "draft" }), ValidationError);
});

test("public catalogue applies price/type/category filters, featured order, and clamps empty pages", async (t) => {
  mockDatabase(t);
  const categoryId = new Types.ObjectId();
  let categoryFindFilter: Record<string, unknown> | undefined;
  replaceMethod(t, CategoryModel, "findOne", (filter: Record<string, unknown>) => { categoryFindFilter = filter; return { select() { return this; }, lean() { return this; }, async exec() { return { _id: categoryId }; } }; });
  let productFilter: Record<string, unknown> | undefined;
  let productSort: Record<string, number> | undefined;
  let productSkip = -1;
  const query = {
    sort(value: Record<string, number>) { productSort = value; return this; },
    skip(value: number) { productSkip = value; return this; },
    limit() { return this; }, lean() { return this; }, async exec() { return []; },
  };
  replaceMethod(t, ProductModel, "find", (filter: Record<string, unknown>) => { productFilter = filter; return query; });
  replaceMethod(t, ProductModel, "countDocuments", async () => 0);
  const result = await listPublicProducts({ category: "ghar-se-kaam", productType: "pdf_bundle", minPrice: "99.00", maxPrice: "499.50", search: "  starter   kit ", page: "10", pageSize: "12" });
  assert.deepEqual(categoryFindFilter, { slug: "ghar-se-kaam", status: "active" });
  assert.equal(productFilter?.publicationStatus, "published");
  assert.equal((productFilter?.categoryIds as Types.ObjectId).toString(), categoryId.toString());
  assert.equal(productFilter?.productType, "pdf_bundle");
  assert.deepEqual(productFilter?.pricePaise, { $gte: 9900, $lte: 49950 });
  assert.deepEqual(productFilter?.$text, { $search: "starter kit" });
  assert.deepEqual(productSort, { featured: -1, displayOrder: 1, createdAt: -1, _id: -1 });
  assert.equal(productSkip, 0);
  assert.deepEqual(result.pagination, { page: 1, pageSize: 12, total: 0, totalPages: 0 });
});

test("public product lookup is limited to published slugs and admin lookup validates IDs", async (t) => {
  mockDatabase(t);
  const product = { slug: "public-guide", publicationStatus: "published" };
  let publicFilter: Record<string, unknown> | undefined;
  replaceMethod(t, ProductModel, "findOne", (filter: Record<string, unknown>) => {
    publicFilter = filter;
    return { lean() { return this; }, async exec() { return product; } };
  });
  assert.equal(await getPublicProductBySlug("public-guide"), product);
  assert.deepEqual(publicFilter, { slug: "public-guide", publicationStatus: "published" });

  replaceMethod(t, ProductModel, "findById", (id: Types.ObjectId) => {
    assert.equal(id.toString(), "64b64c000000000000000001");
    return { lean() { return this; }, async exec() { return product; } };
  });
  assert.equal(await getProductById("64b64c000000000000000001"), product);
});

test("public product page data resolves active categories and preserves bundle PDF order", async (t) => {
  mockDatabase(t);
  const categoryId = new Types.ObjectId();
  const firstId = new Types.ObjectId();
  const secondId = new Types.ObjectId();
  const bundle = {
    _id: new Types.ObjectId(), slug: "bundle-page", name: "Bundle", productType: "pdf_bundle",
    categoryIds: [categoryId], includedProductIds: [secondId, firstId], publicationStatus: "published",
  };
  replaceMethod(t, ProductModel, "findOne", () => ({ lean() { return this; }, async exec() { return bundle; } }));
  replaceMethod(t, CategoryModel, "find", () => ({ select() { return this; }, lean() { return this; }, async exec() { return [{ _id: categoryId, name: "Guides", slug: "guides" }]; } }));
  replaceMethod(t, ProductModel, "find", (filter: Record<string, unknown>) => {
    assert.equal(filter.productType, "pdf");
    assert.equal(filter.publicationStatus, "published");
    return { select() { return this; }, lean() { return this; }, async exec() { return [{ _id: firstId, name: "PDF One" }, { _id: secondId, name: "PDF Two" }]; } };
  });
  const result = await getPublicProductPageData("bundle-page");
  assert.equal(result.categories[0].name, "Guides");
  assert.deepEqual(result.includedProducts.map((item) => item.name), ["PDF Two", "PDF One"]);
});

test("validates product category existence and archived-category restrictions", async (t) => {
  mockDatabase(t);
  const categoryId = "64b64c000000000000000010";
  mockRelationFind(t, CategoryModel, [{ _id: new Types.ObjectId(categoryId), status: "active" }]);
  mockExists(t, null);
  mockSave(t);
  const created = await createProduct(productInput({ categoryIds: [categoryId] }), adminId);
  assert.equal(created.categoryIds[0].toString(), categoryId);

  mockDatabase(t);
  mockRelationFind(t, CategoryModel, [{ _id: new Types.ObjectId(categoryId), status: "archived" }]);
  mockExists(t, null);
  await assert.rejects(createProduct(productInput({ categoryIds: [categoryId] }), adminId), ValidationError);
});

test("rejects missing, nested, and non-PDF bundle components", async (t) => {
  mockDatabase(t);
  mockExists(t, null);
  mockRelationFind(t, ProductModel, []);
  await assert.rejects(createProduct(productInput({ productType: "pdf_bundle", bundleKind: "bundle", includedProductIds: ["64b64c000000000000000001"] }), adminId), ValidationError);

  mockDatabase(t);
  mockExists(t, null);
  mockRelationFind(t, ProductModel, [{ _id: new Types.ObjectId("64b64c000000000000000001"), productType: "pdf_bundle", publicationStatus: "draft" }]);
  await assert.rejects(createProduct(productInput({ productType: "pdf_bundle", bundleKind: "bundle", includedProductIds: ["64b64c000000000000000001"] }), adminId), ValidationError);

  mockDatabase(t);
  mockExists(t, null);
  mockRelationFind(t, ProductModel, [{ _id: new Types.ObjectId("64b64c000000000000000001"), productType: "call_guidance", publicationStatus: "published" }]);
  await assert.rejects(createProduct(productInput({ productType: "pdf_bundle", bundleKind: "bundle", includedProductIds: ["64b64c000000000000000001"] }), adminId), ValidationError);
});

test("rejects a bundle that includes itself during update", async (t) => {
  mockDatabase(t);
  const bundle = new ProductModel({ ...productInput({ productType: "pdf_bundle" }), slug: "self-bundle", bundleKind: "bundle", includedProductIds: [new Types.ObjectId()] });
  replaceMethod(t, ProductModel, "findById", async () => bundle);
  await assert.rejects(updateProduct(bundle._id.toString(), { includedProductIds: [bundle._id.toString()] }, adminId), ValidationError);
});

test("publishes a PDF only when its assigned asset is active and belongs to it", async (t) => {
  mockDatabase(t);
  const activeAssetId = new Types.ObjectId();
  const product = new ProductModel({ ...productInput(), primaryAssetId: activeAssetId });
  replaceMethod(t, ProductModel, "findById", async () => product);
  replaceMethod(t, ProductAssetModel, "exists", async (filter: Record<string, unknown>) => {
    assert.equal((filter._id as Types.ObjectId).toString(), activeAssetId.toString());
    assert.equal(filter.productId, product._id);
    assert.equal(filter.status, "active");
    return { _id: activeAssetId };
  });
  mockSave(t);
  const published = await changeProductStatus(product._id.toString(), { status: "published" }, adminId);
  assert.equal(published.publicationStatus, "published");
});

test("allows unpublishing a product back to draft with an audit event", async (t) => {
  const database = mockDatabase(t);
  const product = new ProductModel({ ...productInput(), publicationStatus: "published", primaryAssetId: new Types.ObjectId() });
  replaceMethod(t, ProductModel, "findById", async () => product);
  replaceMethod(t, ProductModel, "countDocuments", async () => 0);
  mockSave(t);
  const updated = await changeProductStatus(product._id.toString(), { status: "draft" }, adminId);
  assert.equal(updated.publicationStatus, "draft");
  assert.equal(database.auditEvents[0].action, "product.draft");
});

test("refuses permanent deletion when customer order history exists", async (t) => {
  mockDatabase(t);
  const product = new ProductModel({ ...productInput(), slug: "history-guide" });
  replaceMethod(t, ProductModel, "findById", async () => product);
  replaceMethod(t, ProductModel, "exists", async () => null);
  replaceMethod(t, OrderModel, "exists", async () => ({ _id: new Types.ObjectId() }));
  replaceMethod(t, PurchaseModel, "exists", async () => null);
  replaceMethod(t, BookingModel, "exists", async () => null);
  replaceMethod(t, CouponModel, "exists", async () => null);
  replaceMethod(t, OutboxEventModel, "exists", async () => null);
  await assert.rejects(deleteProduct(product._id.toString(), adminId), ConflictError);
});

test("does not publish a PDF without an active assigned asset or active categories", async (t) => {
  mockDatabase(t);
  const product = new ProductModel(productInput());
  replaceMethod(t, ProductModel, "findById", async () => product);
  await assert.rejects(changeProductStatus(product._id.toString(), { status: "published" }, adminId), ValidationError);

  mockDatabase(t);
  const assetId = new Types.ObjectId();
  const categoryId = new Types.ObjectId();
  const categorized = new ProductModel({ ...productInput(), primaryAssetId: assetId, categoryIds: [categoryId] });
  replaceMethod(t, ProductModel, "findById", async () => categorized);
  replaceMethod(t, CategoryModel, "find", () => ({ select() { return this; }, lean() { return this; }, async exec() { return [{ _id: categoryId, status: "inactive" }]; } }));
  replaceMethod(t, ProductAssetModel, "exists", async () => ({ _id: assetId }));
  await assert.rejects(changeProductStatus(categorized._id.toString(), { status: "published" }, adminId), ValidationError);
});

test("publishes a bundle only when every component is a published PDF with an active owned asset", async (t) => {
  mockDatabase(t);
  const includedProductId = new Types.ObjectId();
  const includedAssetId = new Types.ObjectId();
  const bundle = new ProductModel({
    ...productInput({ productType: "pdf_bundle" }),
    bundleKind: "bundle",
    includedProductIds: [includedProductId],
  });
  replaceMethod(t, ProductModel, "findById", async () => bundle);
  mockRelationFind(t, ProductModel, [{
    _id: includedProductId,
    productType: "pdf",
    publicationStatus: "published",
    primaryAssetId: includedAssetId,
  }]);
  mockRelationFind(t, ProductAssetModel, [{ _id: includedAssetId, productId: includedProductId }]);
  mockSave(t);
  const published = await changeProductStatus(bundle._id.toString(), { status: "published" }, adminId);
  assert.equal(published.publicationStatus, "published");
});

test("does not publish a bundle whose included PDF is still a draft", async (t) => {
  mockDatabase(t);
  const includedProductId = new Types.ObjectId();
  const bundle = new ProductModel({
    ...productInput({ productType: "pdf_bundle" }),
    bundleKind: "starter_kit",
    includedProductIds: [includedProductId],
  });
  replaceMethod(t, ProductModel, "findById", async () => bundle);
  mockRelationFind(t, ProductModel, [{ _id: includedProductId, productType: "pdf", publicationStatus: "draft" }]);
  await assert.rejects(changeProductStatus(bundle._id.toString(), { status: "published" }, adminId), ValidationError);
});

test("archives with administrator attribution and protects published bundle components", async (t) => {
  mockDatabase(t);
  const product = new ProductModel(productInput());
  replaceMethod(t, ProductModel, "findById", async () => product);
  replaceMethod(t, ProductModel, "countDocuments", async () => 1);
  await assert.rejects(changeProductStatus(product._id.toString(), { status: "archived" }, adminId), ConflictError);

  mockDatabase(t);
  const archivable = new ProductModel(productInput());
  replaceMethod(t, ProductModel, "findById", async () => archivable);
  replaceMethod(t, ProductModel, "countDocuments", async () => 0);
  mockSave(t);
  const actorId = new Types.ObjectId().toString();
  const archived = await changeProductStatus(archivable._id.toString(), { status: "archived" }, actorId);
  assert.equal(archived.publicationStatus, "archived");
  assert.ok(archived.archivedAt instanceof Date);
  assert.equal(archived.archivedBy?.toString(), actorId);
});

test("prevents unpublishing a PDF while a published bundle depends on it", async (t) => {
  mockDatabase(t);
  const product = new ProductModel({ ...productInput(), publicationStatus: "published", primaryAssetId: new Types.ObjectId() });
  replaceMethod(t, ProductModel, "findById", async () => product);
  replaceMethod(t, ProductModel, "countDocuments", async () => 1);
  await assert.rejects(changeProductStatus(product._id.toString(), { status: "draft" }, adminId), ConflictError);
});
