
import "server-only";

import { Types } from "mongoose";

import {
  assertCategoryCanBeDeactivated,
  assertCategoryStatusTransition,
} from "./category-policy";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../errors/app-error";
import { connectToDatabase } from "../db/mongodb";
import { CategoryModel, ProductModel } from "../db/models";

import {
  categoryStatusSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  slugifyCategoryName,
  updateCategorySchema
} from "./category-validation";

function validateInput<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  input: unknown,
): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.map(String).join(".") || "category",
        message: issue.message,
      })),
    );
  }

  return result.data;
}

function validateCategoryId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new ValidationError([
      { field: "categoryId", message: "Invalid category ID." },
    ]);
  }

  return new Types.ObjectId(id);
}

async function ensureSlugAvailable(
  slug: string,
  excludeId?: Types.ObjectId,
): Promise<void> {
  const filter = excludeId
    ? { slug, _id: { $ne: excludeId } }
    : { slug };

  const existing = await CategoryModel.exists(filter);

  if (existing) {
    throw new ConflictError();
  }
}

export async function createCategory(input: unknown) {
  await connectToDatabase();

  const data = validateInput(createCategorySchema, input);
  const slug = data.slug ?? slugifyCategoryName(data.name);

  if (!slug) {
    throw new ValidationError([
      { field: "name", message: "A valid slug could not be generated." },
    ]);
  }

  await ensureSlugAvailable(slug);

  const category = new CategoryModel({
    name: data.name,
    slug,
    description: data.description,
    ...(data.imageRef ? { imageRef: data.imageRef } : {}),
    displayOrder: data.displayOrder,
    status: "active",
  });

  await category.save();

  return category.toObject();
}

export async function updateCategory(id: string, input: unknown) {
  await connectToDatabase();

  const categoryId = validateCategoryId(id);
  const data = validateInput(updateCategorySchema, input);

  const category = await CategoryModel.findById(categoryId);

  if (!category) {
    throw new NotFoundError();
  }

  if (data.slug !== undefined) {
    await ensureSlugAvailable(data.slug, categoryId);
    category.slug = data.slug;
  }

  if (data.name !== undefined) category.name = data.name;
  if (data.description !== undefined) category.description = data.description;

  if ("imageRef" in data) {
    category.imageRef = data.imageRef ?? undefined;
  }

  if (data.displayOrder !== undefined) {
    category.displayOrder = data.displayOrder;
  }

  await category.save();

  return category.toObject();
}

export async function changeCategoryStatus(
  id: string,
  input: unknown,
) {
  await connectToDatabase();

  const categoryId = validateCategoryId(id);
  const data = validateInput(categoryStatusSchema, input);

  const category = await CategoryModel.findById(categoryId);

  if (!category) {
    throw new NotFoundError();
  }

  if (category.status === "archived" && data.status !== "archived") {
  throw new ConflictError();
}

  assertCategoryStatusTransition(category.status, data.status);

  if (data.status !== "active" && category.status !== "archived") {
    const publishedProductCount = await ProductModel.countDocuments({
      categoryIds: categoryId,
      publicationStatus: "published",
    });

    assertCategoryCanBeDeactivated(publishedProductCount);
  }

  category.status = data.status;
  await category.save();

  return category.toObject();
}

export async function getCategoryById(id: string) {
  await connectToDatabase();

  const categoryId = validateCategoryId(id);
  const category = await CategoryModel.findById(categoryId).lean();

  if (!category) {
    throw new NotFoundError();
  }

  return category;
}

export async function listCategories(input: unknown = {}) {
  await connectToDatabase();

  const query = validateInput(listCategoriesQuerySchema, input);

  const filter = query.status ? { status: query.status } : {};
  const skip = (query.page - 1) * query.pageSize;

  const [categories, total] = await Promise.all([
    CategoryModel.find(filter)
      .sort({ displayOrder: 1, name: 1 })
      .skip(skip)
      .limit(query.pageSize)
      .lean()
      .exec(),
    CategoryModel.countDocuments(filter),
  ]);

  return {
    items: categories,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}
