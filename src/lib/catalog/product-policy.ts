import { ConflictError } from "../errors/app-error";
import type { ProductStatus } from "./product-validation";

/** Archived products are terminal; published products can return to draft before republishing. */
export function assertProductStatusTransition(current: ProductStatus, next: ProductStatus): void {
  if (current === next) return;
  if (current === "archived") {
    throw new ConflictError();
  }
}

export function buildPublicProductFilter(categoryId?: string) {
  return {
    publicationStatus: "published" as const,
    ...(categoryId ? { categoryIds: categoryId } : {}),
  };
}
