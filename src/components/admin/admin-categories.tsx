"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type CategoryStatus = "active" | "inactive" | "archived";
type Category = {
  _id: string;
  name: string;
  slug: string;
  description: string;
  displayOrder: number;
  status: CategoryStatus;
};
type ApiResult<T> = { success?: boolean; data?: T; error?: { message?: string } };
type CategoryPage = { items: Category[]; pagination: { page: number; total: number; totalPages: number } };
type CategoryForm = { name: string; slug: string; description: string; displayOrder: string };

const emptyForm: CategoryForm = { name: "", slug: "", description: "", displayOrder: "0" };
const inputClass = "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30";
const statusLabels: Record<CategoryStatus, string> = { active: "Active", inactive: "Inactive", archived: "Archived" };

function slugify(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160).replace(/-+$/g, "");
}

function apiError<T>(result: ApiResult<T>, fallback: string): string {
  return result.error?.message || fallback;
}

export function AdminCategories() {
  const [items, setItems] = useState<Category[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | CategoryStatus>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);

  const loadCategories = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (statusFilter) query.set("status", statusFilter);
      const response = await fetch(`/api/admin/categories?${query.toString()}`, { credentials: "same-origin", cache: "no-store", signal });
      const result = await response.json() as ApiResult<CategoryPage>;
      if (!response.ok || !result.success || !result.data) throw new Error(apiError(result, "Categories could not be loaded."));
      setItems(result.data.items);
      setTotal(result.data.pagination.total);
      setTotalPages(Math.max(1, result.data.pagination.totalPages));
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Categories could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadCategories(controller.signal));
    return () => controller.abort();
  }, [loadCategories]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setError("");
    setFeedback("");
  }

  function startEdit(category: Category) {
    setEditingId(category._id);
    setForm({ name: category.name, slug: category.slug, description: category.description, displayOrder: String(category.displayOrder) });
    setSlugTouched(true);
    setError("");
    setFeedback("");
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFeedback("");
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim(),
      displayOrder: Number(form.displayOrder),
    };
    if (form.slug.trim()) payload.slug = form.slug.trim();
    try {
      const response = await fetch(editingId ? `/api/admin/categories/${encodeURIComponent(editingId)}` : "/api/admin/categories", {
        method: editingId ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as ApiResult<Category>;
      if (!response.ok || !result.success) throw new Error(apiError(result, "Category could not be saved."));
      setFeedback(editingId ? "Category changes saved." : "Category created.");
      setEditingId(null);
      setForm(emptyForm);
      setSlugTouched(false);
      if (page !== 1) setPage(1);
      else await loadCategories();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Category could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(category: Category, status: CategoryStatus) {
    if (status === category.status || category.status === "archived") return;
    const action = status === "archived" ? "archive" : status === "inactive" ? "deactivate" : "activate";
    const impact = status === "active" ? "" : " Published products that use this category may prevent the change.";
    if (!window.confirm(`Are you sure you want to ${action} ${category.name}?${impact}`)) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(`/api/admin/categories/${encodeURIComponent(category._id)}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json() as ApiResult<Category>;
      if (!response.ok || !result.success) throw new Error(apiError(result, "Category status could not be changed."));
      setFeedback(`Category is now ${statusLabels[status].toLowerCase()}.`);
      await loadCategories();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Category status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">ADMIN  CATALOGUE</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Categories</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">Create and organize catalogue categories. Categories used by published products cannot be hidden.</p>
        </div>
        <button type="button" onClick={startCreate} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-background transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">Create category</button>
      </header>

      {feedback && <p className="mt-6 rounded-xl border border-emerald-700/25 bg-emerald-500/10 px-4 py-3 text-sm text-foreground" role="status">{feedback}</p>}
      {error && <p className="mt-6 rounded-xl border border-red-700/25 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200" role="alert">{error}</p>}

      {(editingId !== null || form.name !== "" || (form.slug === "" && !feedback && total === 0)) && (
        <form onSubmit={(event) => void saveCategory(event)} className="mt-7 rounded-2xl border border-border bg-surface p-5 sm:p-7" aria-labelledby="category-form-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="category-form-title" className="text-lg font-semibold text-foreground">{editingId ? "Edit category" : "New category"}</h2>
              <p className="mt-1 text-sm text-foreground-secondary">Slugs are generated from the name and can be edited.</p>
            </div>
            {total > 0 && <button type="button" onClick={startCreate} className="min-h-11 rounded-full px-3 text-sm font-semibold text-foreground-secondary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Cancel</button>}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">Name
              <input required maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, ...(!slugTouched ? { slug: slugify(event.target.value) } : {}) }))} className={inputClass} autoComplete="off" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">Slug
              <input maxLength={160} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event) => { setSlugTouched(true); setForm((current) => ({ ...current, slug: event.target.value })); }} className={inputClass} autoComplete="off" aria-describedby="category-slug-help" />
              <span id="category-slug-help" className="text-xs font-normal text-foreground-secondary">Lowercase letters, numbers, and hyphens.</span>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">Description
              <textarea maxLength={2000} rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={`${inputClass} min-h-24 py-3`} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">Display order
              <input type="number" min={0} max={1000000} step={1} value={form.displayOrder} onChange={(event) => setForm((current) => ({ ...current, displayOrder: event.target.value }))} className={inputClass} />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-accent px-5 text-sm font-semibold text-[#0f1e36] transition-colors hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60">{busy ? "Saving" : editingId ? "Save changes" : "Create category"}</button>
            {total > 0 && <button type="button" onClick={startCreate} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-foreground transition-colors hover:bg-background">Cancel</button>}
          </div>
        </form>
      )}

      <section className="mt-8" aria-labelledby="category-list-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="category-list-title" className="text-lg font-semibold text-foreground">Category list</h2>
            <p className="mt-1 text-sm text-foreground-secondary">{total} {total === 1 ? "category" : "categories"}</p>
          </div>
          <label className="grid gap-1 text-xs font-medium text-foreground-secondary">Filter by status
            <select value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value as "" | CategoryStatus); }} className={`${inputClass} min-w-40`}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>

        {loading ? <p className="mt-5 rounded-2xl border border-border bg-surface p-6 text-sm text-foreground-secondary" role="status">Loading categories</p> : items.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
            <h3 className="font-semibold text-foreground">No categories found</h3>
            <p className="mt-2 text-sm text-foreground-secondary">Create a category to organize the catalogue.</p>
          </div>
        ) : (
          <ul className="mt-5 grid gap-4 lg:grid-cols-2">
            {items.map((category) => (
              <li key={category._id}>
                <article className="h-full rounded-2xl border border-border bg-surface p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="break-words text-base font-semibold text-foreground">{category.name}</h3>
                      <p className="mt-1 break-all font-mono text-xs text-foreground-secondary">/{category.slug}</p>
                    </div>
                    <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground-secondary">{statusLabels[category.status]}</span>
                  </div>
                  {category.description && <p className="mt-4 line-clamp-3 text-sm leading-6 text-foreground-secondary">{category.description}</p>}
                  <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
                    <p className="text-xs text-foreground-secondary">Display order: {category.displayOrder}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => startEdit(category)} disabled={busy} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background disabled:opacity-50">Edit</button>
                      <label className="sr-only" htmlFor={`category-status-${category._id}`}>Status for {category.name}</label>
                      <select id={`category-status-${category._id}`} value={category.status} disabled={busy || category.status === "archived"} onChange={(event) => void changeStatus(category, event.target.value as CategoryStatus)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground disabled:opacity-60">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && <nav aria-label="Category pagination" className="mt-6 flex items-center justify-between gap-4">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
          <p className="text-sm text-foreground-secondary" aria-live="polite">Page {page} of {totalPages}</p>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50">Next</button>
        </nav>}
      </section>
    </div>
  );
}
