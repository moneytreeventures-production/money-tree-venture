
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import * as mongodb from "../../src/lib/db/mongodb";
import {
  CategoryModel,
  ProductModel,
} from "../../src/lib/db/models";
import {
  changeCategoryStatus,
  createCategory,
  getCategoryById,
  updateCategory,
} from "../../src/lib/catalog/category-service";
import {
  ConflictError,
  NotFoundError,
} from "../../src/lib/errors/app-error";

/**
 * Replace a method temporarily and restore it after the test.
 * This lets us test service logic without connecting to MongoDB.
 */
function replaceMethod(
  t: TestContext,
  target: object,
  methodName: string,
  implementation: (...args: never[]) => unknown,
) {
  const descriptor = Object.getOwnPropertyDescriptor(target, methodName);

  Object.defineProperty(target, methodName, {
    configurable: true,
    writable: true,
    value: implementation,
  });

  t.after(() => {
    if (descriptor) {
      Object.defineProperty(target, methodName, descriptor);
    } else {
      Reflect.deleteProperty(target, methodName);
    }
  });
}

function mockDatabaseConnection(t: TestContext) {
  replaceMethod(
    t,
    mongodb,
    "connectToDatabase",
    async () => undefined,
  );
}

function mockCategorySave(t: TestContext) {
  replaceMethod(
    t,
    CategoryModel.prototype,
    "save",
    async function (this: InstanceType<typeof CategoryModel>) {
      return this;
    },
  );
}

function mockCategoryFindById(
  t: TestContext,
  result: InstanceType<typeof CategoryModel> | null,
) {
  replaceMethod(
    t,
    CategoryModel,
    "findById",
    async () => result,
  );
}

function mockCategoryExists(t: TestContext, result: unknown) {
  replaceMethod(
    t,
    CategoryModel,
    "exists",
    async () => result,
  );
}

function mockPublishedProductCount(t: TestContext, count: number) {
  replaceMethod(
    t,
    ProductModel,
    "countDocuments",
    async () => count,
  );
}

test("creates a category and generates its slug", async (t) => {
  mockDatabaseConnection(t);
  mockCategoryExists(t, null);
  mockCategorySave(t);

  const category = await createCategory({
    name: "Personal Finance",
  });

  assert.equal(category.name, "Personal Finance");
  assert.equal(category.slug, "personal-finance");
  assert.equal(category.description, "");
  assert.equal(category.displayOrder, 0);
});

test("rejects category creation when the slug already exists", async (t) => {
  mockDatabaseConnection(t);
  mockCategoryExists(t, { _id: "existing-category" });

  await assert.rejects(
    createCategory({
      name: "Personal Finance",
      slug: "personal-finance",
    }),
    (error: unknown) => error instanceof ConflictError,
  );
});

test("updates an existing category", async (t) => {
  mockDatabaseConnection(t);

  const existingCategory = new CategoryModel({
    name: "Old Name",
    slug: "old-name",
    description: "Old description",
    displayOrder: 0,
    status: "active",
  });

  mockCategoryFindById(t, existingCategory);
  mockCategoryExists(t, null);
  mockCategorySave(t);

  const updated = await updateCategory(
    existingCategory._id.toString(),
    {
      name: "Updated Name",
      description: "Updated description",
    },
  );

  assert.equal(updated.name, "Updated Name");
  assert.equal(updated.slug, "old-name");
  assert.equal(updated.description, "Updated description");
});

test("returns NotFoundError when updating a missing category", async (t) => {
  mockDatabaseConnection(t);
  mockCategoryFindById(t, null);

  await assert.rejects(
    updateCategory("507f1f77bcf86cd799439011", {
      name: "Updated Name",
    }),
    (error: unknown) => error instanceof NotFoundError,
  );
});


test("returns NotFoundError when retrieving a missing category", async (t) => {
  mockDatabaseConnection(t);

  replaceMethod(
    t,
    CategoryModel,
    "findById",
    () => ({
      lean: async () => null,
    }),
  );

  await assert.rejects(
    getCategoryById("507f1f77bcf86cd799439011"),
    (error: unknown) => error instanceof NotFoundError,
  );
});


test("blocks category archival when published products use it", async (t) => {
  mockDatabaseConnection(t);

  const category = new CategoryModel({
    name: "Personal Finance",
    slug: "personal-finance",
    status: "active",
  });

  mockCategoryFindById(t, category);
  mockPublishedProductCount(t, 2);

  await assert.rejects(
    changeCategoryStatus(category._id.toString(), {
      status: "archived",
    }),
    (error: unknown) => error instanceof ConflictError,
  );

  assert.equal(category.status, "active");
});

test("blocks category deactivation when published products still reference it", async (t) => {
  mockDatabaseConnection(t);
  const category = new CategoryModel({ name: "Personal Finance", slug: "personal-finance", status: "active" });
  mockCategoryFindById(t, category);
  mockPublishedProductCount(t, 1);
  await assert.rejects(changeCategoryStatus(category._id.toString(), { status: "inactive" }), (error: unknown) => error instanceof ConflictError);
  assert.equal(category.status, "active");
});

test("allows category archival when no published products use it", async (t) => {
  mockDatabaseConnection(t);

  const category = new CategoryModel({
    name: "Personal Finance",
    slug: "personal-finance",
    status: "active",
  });

  mockCategoryFindById(t, category);
  mockPublishedProductCount(t, 0);
  mockCategorySave(t);

  const updated = await changeCategoryStatus(
    category._id.toString(),
    {
      status: "archived",
    },
  );

  assert.equal(updated.status, "archived");
});

test("does not allow an archived category to become active again", async (t) => {
  mockDatabaseConnection(t);

  const category = new CategoryModel({
    name: "Personal Finance",
    slug: "personal-finance",
    status: "archived",
  });

  mockCategoryFindById(t, category);

  await assert.rejects(
    changeCategoryStatus(category._id.toString(), {
      status: "active",
    }),
    (error: unknown) => error instanceof ConflictError,
  );

  assert.equal(category.status, "archived");
});
