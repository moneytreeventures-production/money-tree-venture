"use client";

import { normalizeProductCategoryIds, toggleProductCategory } from "../../lib/catalog/category-selection";

export interface ProductCategoryOption {
  _id: string;
  name: string;
  status: "active" | "inactive" | "archived";
}

export type ProductCategoryLoadState = "loading" | "ready" | "error";

export function ProductCategoryPicker({
  categories,
  productCategoryIds,
  selectedIds,
  loadState,
  loadError,
  onChange,
  onRetry,
}: {
  categories: ProductCategoryOption[];
  productCategoryIds: string[];
  selectedIds: string[];
  loadState: ProductCategoryLoadState;
  loadError: string;
  onChange: (ids: string[]) => void;
  onRetry: () => void;
}) {
  const knownIds = new Set(categories.map((category) => category._id));
  const unavailableIds = productCategoryIds.filter((id) => !knownIds.has(id));

  function update(id: string, checked: boolean, status: ProductCategoryOption["status"]) {
    onChange(toggleProductCategory(selectedIds, id, checked, status));
  }

  return (
    <fieldset className="grid gap-2 text-sm font-medium text-foreground sm:col-span-2">
      <legend>Categories</legend>
      <p className="text-xs font-normal text-foreground-secondary">Choose one or more categories. Selected: {selectedIds.length}</p>
      {loadState === "loading" && <p className="rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground-secondary" role="status">Loading categories...</p>}
      {loadState === "error" && <div className="rounded-xl border border-red-700/20 bg-red-500/10 p-3" role="alert"><p className="text-sm text-foreground">{loadError || "Categories could not be loaded."}</p><button type="button" onClick={onRetry} className="mt-2 min-h-10 rounded-full border border-border px-4 text-sm font-semibold text-foreground hover:bg-background focus-visible:outline-2 focus-visible:outline-accent">Retry categories</button></div>}
      {loadState === "ready" && categories.length === 0 && unavailableIds.length === 0 && <p className="rounded-xl border border-dashed border-border bg-background px-3 py-4 text-sm text-foreground-secondary">No categories available. <a href="/admin/categories" className="font-semibold text-foreground underline underline-offset-4">Create a category first.</a></p>}
      {loadState === "ready" && (categories.length > 0 || unavailableIds.length > 0) && <div className="grid gap-2 rounded-xl border border-border bg-background p-3 sm:grid-cols-2">
        {categories.filter((category) => category.status === "active" || selectedIds.includes(category._id)).map((category) => {
          const checked = selectedIds.includes(category._id);
          const unavailable = category.status !== "active";
          return <label key={category._id} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${unavailable ? "text-foreground-secondary" : "text-foreground"}`}>
            <input type="checkbox" name="categoryIds" value={category._id} checked={checked} disabled={unavailable && !checked} onChange={(event) => update(category._id, event.target.checked, category.status)} className="size-4 accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
            <span>{category.name}{unavailable ? ` (${category.status})` : ""}</span>
            {checked && <span className="ml-auto text-xs font-semibold text-foreground-secondary">Selected</span>}
          </label>;
        })}
        {unavailableIds.map((id) => <label key={id} className="flex min-h-11 items-center gap-3 rounded-lg border border-amber-700/20 bg-amber-500/5 px-3 py-2 text-xs font-medium text-foreground-secondary"><input type="checkbox" name="categoryIds" value={id} checked={selectedIds.includes(id)} onChange={(event) => update(id, event.target.checked, "archived")} className="size-4 accent-[var(--accent)]" /><span>Existing category unavailable · {id}</span></label>)}
      </div>}
    </fieldset>
  );
}

export function initialProductCategorySelection(categoryIds: string[] | undefined): string[] {
  return normalizeProductCategoryIds(categoryIds ?? []);
}
