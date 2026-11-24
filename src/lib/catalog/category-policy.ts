
import { ConflictError } from "../errors/app-error";
import type { CategoryStatus } from "./category-validation";

/**
 * Archiving is terminal. An archived category must be replaced,
 * not silently reactivated.
 */
export function assertCategoryStatusTransition(
  current: CategoryStatus,
  next: CategoryStatus,
): void {
  if (current === "archived" && next !== "archived") {
    throw new ConflictError();
  }
}

/**
 * An active or inactive category cannot be hidden while published products use it.
 */
export function assertCategoryCanBeDeactivated(
  publishedProductCount: number,
): void {
  if (!Number.isSafeInteger(publishedProductCount) || publishedProductCount < 0) {
    throw new Error("Published product count must be a non-negative integer.");
  }

  if (publishedProductCount > 0) {
    throw new ConflictError();
  }
}

/** Public category queries must never expose inactive or archived records. */
export function buildPublicCategoryFilter() {
  return { status: "active" as const };
}
