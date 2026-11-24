export type SelectableCategoryStatus = "active" | "inactive" | "archived";

/** Keep inactive references unless the admin explicitly removes them; never add one anew. */
export function toggleProductCategory(
  selectedIds: readonly string[],
  categoryId: string,
  checked: boolean,
  status: SelectableCategoryStatus,
): string[] {
  const selected = new Set(selectedIds);
  if (checked) {
    if (status !== "active" || selected.has(categoryId)) return [...selected];
    selected.add(categoryId);
  } else {
    selected.delete(categoryId);
  }
  return [...selected];
}

export function normalizeProductCategoryIds(categoryIds: readonly string[]): string[] {
  return [...new Set(categoryIds.filter((id) => typeof id === "string" && id.length > 0))];
}
