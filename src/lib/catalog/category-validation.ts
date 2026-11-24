
import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required.")
  .max(160, "Slug is too long.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and hyphens.",
  );

const nameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(2000);
const imageRefSchema = z.string().trim().min(1).max(2048);
const displayOrderSchema = z.number().int().min(0).max(1_000_000);

export const createCategorySchema = z.object({
  name: nameSchema,
  slug: slugSchema.optional(),
  description: descriptionSchema.optional().default(""),
  imageRef: imageRefSchema.optional(),
  displayOrder: displayOrderSchema.optional().default(0),
}).strict();

export const updateCategorySchema = z.object({
  name: nameSchema.optional(),
  slug: slugSchema.optional(),
  description: descriptionSchema.optional(),
  imageRef: imageRefSchema.nullable().optional(),
  displayOrder: displayOrderSchema.optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided.",
);

export const categoryStatusSchema = z.object({
  status: z.enum(["active", "inactive", "archived"]),
}).strict();

export const listCategoriesQuerySchema = z.object({
  status: z.enum(["active", "inactive", "archived"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryStatus = z.infer<typeof categoryStatusSchema>["status"];
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

/** Generate a URL-friendly slug when the admin leaves it blank. */
export function slugifyCategoryName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160)
    .replace(/-+$/g, "");
}
