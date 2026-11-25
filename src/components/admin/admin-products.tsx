"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ProductCategoryPicker, type ProductCategoryLoadState } from "./product-category-picker";
import { initialProductCategorySelection } from "./product-category-picker";
import { SkeletonDataTable } from "../ui/skeleton";
import { AccessibleOverlay } from "../ui/accessible-overlay";

type ProductType = "pdf" | "pdf_bundle" | "call_guidance";
type ProductStatus = "draft" | "published" | "archived";
interface AdminProduct {
  _id: string; name: string; slug: string; shortDescription: string; description: string; productType: ProductType;
  bundleKind?: "starter_kit" | "bundle"; categoryIds: string[]; pricePaise: number; compareAtPricePaise?: number;
  imageRefs: string[]; promotionalVideoUrl?: string; features?: string[]; benefits?: string[]; includedContent?: string[];
  faqs?: Array<{ question: string; answer: string }>; featured: boolean; displayOrder: number; publicationStatus: ProductStatus;
  seo?: { title?: string; description?: string }; primaryAssetId?: string; includedProductIds: string[];
  callDurationMinutes?: number; fulfilmentInstructions?: string;
  recordWarnings?: string[]; legacyTitle?: string; canManage?: boolean; hasValidPrice?: boolean; hasValidType?: boolean; hasValidStatus?: boolean;
}
interface Category { _id: string; name: string; status: "active" | "inactive" | "archived" }
interface Asset { id: string; version: string; fileName: string; sizeBytes: number; status: string }
interface ProductMediaItem { id: string; kind: "thumbnail" | "promotional_video"; status: "uploading" | "ready" | "failed"; fileName: string; contentType: string; sizeBytes: number; publicUrl?: string }
interface ApiResult<T> { success?: boolean; data?: T; error?: { message?: string; details?: Array<{ field: string; message: string }> } }
interface Props { initialProducts?: AdminProduct[]; categories?: Category[] }

const typeLabels: Record<ProductType, string> = { pdf: "PDF", pdf_bundle: "PDF Bundle", call_guidance: "Consultant Call" };
const statusLabels: Record<ProductStatus, string> = { draft: "Draft", published: "Published", archived: "Archived" };
const inputClass = "min-h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
const labelClass = "grid gap-2 text-sm font-medium text-foreground";

function readError(result: ApiResult<unknown>, fallback: string) {
  return result.error?.details?.map((item) => `${item.field}: ${item.message}`).join(" · ") || result.error?.message || fallback;
}
function amountToPaise(value: string): number | null {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [rupees, fraction = ""] = value.trim().split(".");
  return Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
}
function rupees(value?: number) { return value === undefined ? "" : (value / 100).toFixed(2); }
function safeThumbnail(ref?: string) { return ref && /^https:\/\//i.test(ref) ? ref : undefined; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize untrusted API records for display without treating invalid values as valid products. */
export function normalizeAdminProducts(value: unknown): AdminProduct[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const record = isRecord(raw) ? raw : {};
    const warnings: string[] = [];
    const id = typeof record._id === "string" && record._id.trim() ? record._id : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const legacyTitle = typeof record.title === "string" && record.title.trim() ? record.title.trim() : undefined;
    const slug = typeof record.slug === "string" ? record.slug.trim() : "";
    const validTypes: ProductType[] = ["pdf", "pdf_bundle", "call_guidance"];
    const validStatuses: ProductStatus[] = ["draft", "published", "archived"];
    const hasValidType = validTypes.includes(record.productType as ProductType);
    const hasValidStatus = validStatuses.includes(record.publicationStatus as ProductStatus);
    const hasValidPrice = typeof record.pricePaise === "number" && Number.isSafeInteger(record.pricePaise) && record.pricePaise >= 0;
    const bundleKind = record.bundleKind === "starter_kit" || record.bundleKind === "bundle" ? record.bundleKind : undefined;
    if (!id) warnings.push("Record ID missing");
    if (!name) warnings.push(legacyTitle ? "Canonical name missing; legacy title found" : "Product name missing");
    if (!slug) warnings.push("Product slug missing");
    if (!Array.isArray(record.imageRefs) || !record.imageRefs.some((ref) => typeof ref === "string" && safeThumbnail(ref))) warnings.push("Thumbnail missing or invalid");
    if (!hasValidType) warnings.push("Product type missing or invalid");
    if (!hasValidStatus) warnings.push("Publication status missing or invalid");
    if (!hasValidPrice) warnings.push("Price missing or invalid");
    if (record.productType === "pdf_bundle" && !bundleKind) warnings.push("Bundle kind missing or invalid");
    const strings = (field: unknown) => Array.isArray(field) ? field.filter((entry): entry is string => typeof entry === "string") : [];
    return {
      ...record,
      _id: id || `invalid-record-${index}`,
      name,
      slug,
      shortDescription: typeof record.shortDescription === "string" ? record.shortDescription : "",
      description: typeof record.description === "string" ? record.description : "",
      productType: hasValidType ? record.productType as ProductType : "pdf",
      bundleKind: record.productType === "pdf_bundle" ? bundleKind : undefined,
      publicationStatus: hasValidStatus ? record.publicationStatus as ProductStatus : "draft",
      pricePaise: hasValidPrice ? record.pricePaise as number : 0,
      categoryIds: strings(record.categoryIds),
      imageRefs: strings(record.imageRefs),
      includedProductIds: strings(record.includedProductIds),
      features: strings(record.features),
      benefits: strings(record.benefits),
      includedContent: strings(record.includedContent),
      faqs: Array.isArray(record.faqs) ? record.faqs.filter((faq): faq is { question: string; answer: string } => isRecord(faq) && typeof faq.question === "string" && typeof faq.answer === "string") : [],
      promotionalVideoUrl: typeof record.promotionalVideoUrl === "string" ? record.promotionalVideoUrl : undefined,
      compareAtPricePaise: typeof record.compareAtPricePaise === "number" && Number.isSafeInteger(record.compareAtPricePaise) ? record.compareAtPricePaise : undefined,
      primaryAssetId: typeof record.primaryAssetId === "string" ? record.primaryAssetId : undefined,
      callDurationMinutes: typeof record.callDurationMinutes === "number" && Number.isSafeInteger(record.callDurationMinutes) ? record.callDurationMinutes : undefined,
      fulfilmentInstructions: typeof record.fulfilmentInstructions === "string" ? record.fulfilmentInstructions : undefined,
      seo: isRecord(record.seo) ? {
        ...(typeof record.seo.title === "string" ? { title: record.seo.title } : {}),
        ...(typeof record.seo.description === "string" ? { description: record.seo.description } : {}),
      } : undefined,
      featured: record.featured === true,
      displayOrder: typeof record.displayOrder === "number" && Number.isSafeInteger(record.displayOrder) ? record.displayOrder : 0,
      recordWarnings: warnings,
      legacyTitle,
      canManage: Boolean(id),
      hasValidPrice,
      hasValidType,
      hasValidStatus,
    } as AdminProduct;
  });
}

function productDisplayName(product: AdminProduct): string {
  const canonicalName = typeof product?.name === "string" ? product.name.trim() : "";
  if (canonicalName) return canonicalName;
  return product.legacyTitle || "Unnamed product";
}

function uploadFileToR2(url: string, headers: Record<string, string>, file: File, onProgress: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    request.onerror = () => reject(new Error("Cloud upload failed. Check the media bucket CORS configuration and try again."));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Cloud upload was rejected (HTTP ${request.status}).`));
    request.send(file);
  });
}

function normalizeCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => isRecord(item) && typeof item._id === "string" && typeof item.name === "string" && (item.status === "active" || item.status === "inactive" || item.status === "archived")
    ? [{ _id: item._id, name: item.name, status: item.status }]
    : []);
}

export function AdminProducts(props: Props) {
  const initialProducts = props.initialProducts ?? [];
  const initialCategories = props.categories ?? [];
  const [products, setProducts] = useState(() => normalizeAdminProducts(initialProducts));
  const [categories, setCategories] = useState(() => normalizeCategories(initialCategories));
  const [categoryLoadState, setCategoryLoadState] = useState<ProductCategoryLoadState>(props.categories === undefined ? "loading" : "ready");
  const [categoryLoadError, setCategoryLoadError] = useState("");
  const [loading, setLoading] = useState(props.initialProducts === undefined);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [productType, setProductType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<AdminProduct | null | undefined>(undefined);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function loadCategories() {
    setCategoryLoadState("loading");
    setCategoryLoadError("");
    try {
      const response = await fetch("/api/admin/categories?page=1&pageSize=100", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json() as ApiResult<{ items: Category[] }>;
      if (!response.ok || !result.success || !result.data || !Array.isArray(result.data.items)) {
        throw new Error(readError(result, "Categories could not be loaded."));
      }
      setCategories(normalizeCategories(result.data.items));
      setCategoryLoadState("ready");
    } catch (cause) {
      setCategoryLoadError(cause instanceof Error ? cause.message : "Categories could not be loaded.");
      setCategoryLoadState("error");
    }
  }

  async function loadProducts(nextPage = page) {
    setLoading(true);
    try {
    const query = new URLSearchParams({ page: String(nextPage), pageSize: "20" });
    if (search.trim()) query.set("search", search.trim());
    if (status) query.set("publicationStatus", status);
    if (productType) query.set("productType", productType);
    if (categoryId) query.set("categoryId", categoryId);
    const response = await fetch(`/api/admin/products?${query}`, { credentials: "same-origin", cache: "no-store" });
    const result = await response.json() as ApiResult<{ items: AdminProduct[]; pagination: { total: number; totalPages: number } }>;
    if (!response.ok || !result.success || !result.data) throw new Error(readError(result, "Products could not be loaded."));
    setProducts(normalizeAdminProducts(result.data.items)); setTotal(Number.isSafeInteger(result.data.pagination?.total) ? result.data.pagination.total : 0); setPages(Math.max(1, Number.isSafeInteger(result.data.pagination?.totalPages) ? result.data.pagination.totalPages : 1)); setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/admin/products?page=1&pageSize=20", { credentials: "same-origin", cache: "no-store" }).then(async (response) => {
        const result = await response.json() as ApiResult<{ items: AdminProduct[]; pagination: { total: number; totalPages: number } }>;
        if (!response.ok || !result.success || !result.data) throw new Error(readError(result, "Products could not be loaded."));
        if (!cancelled) { setProducts(normalizeAdminProducts(result.data.items)); setTotal(Number.isSafeInteger(result.data.pagination?.total) ? result.data.pagination.total : 0); setPages(Math.max(1, Number.isSafeInteger(result.data.pagination?.totalPages) ? result.data.pagination.totalPages : 1)); }
      }),
      fetch("/api/admin/categories?page=1&pageSize=100", { credentials: "same-origin", cache: "no-store" }).then(async (response) => {
        const result = await response.json() as ApiResult<{ items: Category[] }>;
        if (!response.ok || !result.success || !result.data || !Array.isArray(result.data.items)) throw new Error(readError(result, "Categories could not be loaded."));
        if (!cancelled) { setCategories(normalizeCategories(result.data.items)); setCategoryLoadState("ready"); setCategoryLoadError(""); }
      }).catch((cause: unknown) => {
        if (!cancelled) { setCategoryLoadState("error"); setCategoryLoadError(cause instanceof Error ? cause.message : "Categories could not be loaded."); }
      }),
    ]).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Products could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    // Product and category requests have independent error states.
    return () => { cancelled = true; };
  }, []);

  async function refresh(nextPage = page) {
    try { setError(""); await loadProducts(nextPage); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Products could not be loaded."); }
  }

  async function changeStatus(product: AdminProduct, next: ProductStatus) {
    setBusy(product._id); setError(""); setFeedback("");
    try {
      const response = await fetch(`/api/admin/products/${product._id}/status`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.success) throw new Error(readError(result, "The status could not be updated."));
      setFeedback(`${productDisplayName(product)} ka status ${statusLabels[next]} ho gaya.`); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The status could not be updated."); }
    finally { setBusy(null); }
  }

  async function removeProduct(product: AdminProduct) {
    if (!window.confirm(`Permanently delete “${productDisplayName(product)}”? Products linked to customers or orders cannot be deleted; archive them instead.`)) return;
    setBusy(product._id); setError(""); setFeedback("");
    try {
      const response = await fetch(`/api/admin/products/${product._id}`, { method: "DELETE", credentials: "same-origin" });
      const result = await response.json() as ApiResult<unknown>;
      if (!response.ok || !result.success) throw new Error(readError(result, "The product could not be deleted. Archive products linked to customer history."));
      setFeedback("The product and its unreferenced private PDF asset were deleted."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The product could not be deleted."); }
    finally { setBusy(null); }
  }

  const countLabel = useMemo(() => `${total} product${total === 1 ? "" : "s"}`, [total]);
  return <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground">ADMIN · CATALOGUE</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Product management</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">Manage products, private PDFs, and publication status.</p></div>
      <button type="button" onClick={() => { setEditing(null); setError(""); setFeedback(""); }} className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-background transition hover:bg-primary-hover">+ Add product</button>
    </div>
    <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <label className="min-w-52 flex-1"><span className="sr-only">Product search</span><input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void refresh(1); }} placeholder="Search title or short description" /></label>
      <select aria-label="Publication status filter" className={`${inputClass} w-auto min-w-36`} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>
      <select aria-label="Product type filter" className={`${inputClass} w-auto min-w-40`} value={productType} onChange={(event) => setProductType(event.target.value)}><option value="">All types</option><option value="pdf">PDF</option><option value="pdf_bundle">PDF Bundle</option><option value="call_guidance">Consultant Call</option></select>
      <select aria-label="Category filter" className={`${inputClass} w-auto min-w-40`} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select>
      <button type="button" onClick={() => void refresh(1)} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-background">Search</button>
    </div>
    {feedback && <p className="mt-4 rounded-xl border border-emerald-700/20 bg-emerald-500/10 px-4 py-3 text-sm text-foreground" role="status">{feedback}</p>}
    {error && <p className="mt-4 rounded-xl border border-red-700/20 bg-red-500/10 px-4 py-3 text-sm text-foreground" role="alert">{error}</p>}
    <div className="mt-5 flex items-center justify-between text-xs text-foreground-secondary"><span>{countLabel}</span><span>Private PDF links are not shown in the product list.</span></div>
    <section className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Products">
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(85px,.65fr)_minmax(100px,.8fr)_minmax(105px,.85fr)_minmax(90px,.7fr)_minmax(220px,1.4fr)] gap-4 border-b border-border bg-background/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-foreground-secondary lg:grid"><span>Product</span><span>Type</span><span>Category</span><span>Price</span><span>Status</span><span>Actions</span></div>
      {loading ? <SkeletonDataTable /> : error && products.length === 0 ? <p className="p-8 text-center text-sm text-foreground-secondary">Product list could not be loaded.</p> : products.length === 0 ? <p className="p-8 text-center text-sm text-foreground-secondary">No products match these filters.</p> : products.map((product) => {
        const thumb = safeThumbnail(product.imageRefs?.[0]);
        const displayName = productDisplayName(product);
        const requiredRecordWarnings = product.recordWarnings?.filter((warning) => warning !== "Thumbnail missing or invalid") ?? [];
        const lifecycleAllowed = Boolean(product.canManage && requiredRecordWarnings.length === 0);
        const displayedType = product.hasValidType ? typeLabels[product.productType] : "Unknown type";
        const displayedStatus = product.hasValidStatus ? statusLabels[product.publicationStatus] : "Unknown status";
        const productCategories = product.categoryIds.map((id) => categories.find((category) => category._id === id)?.name).filter((name): name is string => Boolean(name));
        return <article key={product._id} className="grid gap-4 border-b border-border p-4 last:border-0 sm:p-5 lg:grid-cols-[minmax(0,2fr)_minmax(85px,.65fr)_minmax(100px,.8fr)_minmax(105px,.85fr)_minmax(90px,.7fr)_minmax(220px,1.4fr)] lg:items-center">
          <div className="flex min-w-0 items-center gap-4"><div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background">{thumb ? <Image src={thumb} alt={`${displayName} thumbnail`} fill sizes="64px" unoptimized className="object-cover" /> : <span className="px-1 text-center text-[10px] font-semibold text-foreground-secondary">No image</span>}</div><div className="min-w-0"><h2 className="truncate font-semibold text-foreground">{displayName}</h2><p className="mt-1 truncate text-xs text-foreground-secondary">{product.slug ? `/${product.slug}` : "Slug unavailable"}</p></div></div>
          <div><span className="lg:hidden text-xs text-foreground-secondary">Type: </span><span className="text-sm text-foreground-secondary">{displayedType}</span>{product.bundleKind && product.hasValidType && <span className="ml-1 text-xs text-foreground-secondary">({product.bundleKind === "starter_kit" ? "Starter Kit" : "Bundle"})</span>}</div>
          <div className="text-sm text-foreground-secondary"><span className="mb-1 block text-[11px] lg:hidden">Category</span><span>{productCategories.join(", ") || (product.categoryIds.length ? "Category unavailable" : "No category")}</span></div>
          <div><p className="text-sm font-semibold text-foreground">{product.hasValidPrice ? `INR ${rupees(product.pricePaise)}` : "Price unavailable"}</p>{product.compareAtPricePaise !== undefined && <p className="mt-1 text-xs text-foreground-secondary">Compare at INR {rupees(product.compareAtPricePaise)}</p>}{product.featured && <span className="mt-1 inline-block rounded-full border border-accent/30 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">Featured</span>}</div>
          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${product.publicationStatus === "published" && product.hasValidStatus ? "border-emerald-700/20 bg-emerald-500/10 text-foreground" : "border-border text-foreground-secondary"}`}>{displayedStatus}</span>
          <div className="flex flex-wrap gap-2 lg:col-span-1"><button type="button" disabled={!product.canManage} onClick={() => { setEditing(product); setError(""); setFeedback(""); }} className="min-h-11 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50">Edit</button>
            {product.hasValidStatus && product.publicationStatus === "draft" && <button type="button" disabled={!lifecycleAllowed || busy === product._id} onClick={() => void changeStatus(product, "published")} className="min-h-11 rounded-full bg-primary px-3.5 text-xs font-semibold text-background hover:bg-primary-hover disabled:opacity-50">Publish</button>}
            {product.hasValidStatus && product.publicationStatus === "published" && <button type="button" disabled={!lifecycleAllowed || busy === product._id} onClick={() => void changeStatus(product, "draft")} className="min-h-11 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50">Unpublish</button>}
            {product.hasValidStatus && product.publicationStatus !== "archived" && <button type="button" disabled={!lifecycleAllowed || busy === product._id} onClick={() => void changeStatus(product, "archived")} className="min-h-11 rounded-full border border-border px-3.5 text-xs font-semibold text-foreground-secondary hover:bg-background disabled:opacity-50">Archive</button>}
            {product.hasValidStatus && product.publicationStatus !== "published" && <button type="button" disabled={!product.canManage || busy === product._id} onClick={() => void removeProduct(product)} className="min-h-11 rounded-full border border-red-700/20 px-3.5 text-xs font-semibold text-red-700 hover:bg-red-500/10 disabled:opacity-50">Delete</button>}
          </div>
          {product.recordWarnings?.length ? <p className="rounded-lg border border-amber-700/20 bg-amber-500/10 px-3 py-2 text-xs text-foreground sm:col-span-2 lg:col-span-6" role="status">Record needs attention: {product.recordWarnings.join("; ")}. Required data issues disable lifecycle changes; a thumbnail is optional. {product.legacyTitle ? "Legacy title is shown temporarily; save a canonical name to repair this record." : ""}</p> : null}
        </article>;
      })}
    </section>
    <div className="mt-5 flex items-center justify-between"><button type="button" disabled={page <= 1} onClick={() => { setPage((value) => value - 1); void loadProducts(page - 1); }} className="min-h-11 rounded-full border border-border px-4 text-sm disabled:opacity-40">Pichhla</button><span className="text-sm text-foreground-secondary">Page {page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => { setPage((value) => value + 1); void loadProducts(page + 1); }} className="min-h-11 rounded-full border border-border px-4 text-sm disabled:opacity-40">Agla</button></div>
    {editing !== undefined && <ProductEditor product={editing} categories={categories} categoryLoadState={categoryLoadState} categoryLoadError={categoryLoadError} onRetryCategories={() => void loadCategories()} products={products} onClose={() => setEditing(undefined)} onSaved={async (message) => { setEditing(undefined); setFeedback(message); await refresh(); }} onError={setError} />}
  </div>;
}

function ProductEditor({ product, categories, categoryLoadState, categoryLoadError, onRetryCategories, products, onClose, onSaved, onError }: { product: AdminProduct | null; categories: Category[]; categoryLoadState: ProductCategoryLoadState; categoryLoadError: string; onRetryCategories: () => void; products: AdminProduct[]; onClose: () => void; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState(product?.primaryAssetId ?? "");
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState<"success" | "error">("error");
  const [type, setType] = useState<ProductType>(product?.productType ?? "pdf");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() => initialProductCategorySelection(product?.categoryIds));
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [imageRefs, setImageRefs] = useState(product?.imageRefs?.join("\n") ?? "");
  const [promotionalVideoUrl, setPromotionalVideoUrl] = useState(product?.promotionalVideoUrl ?? "");
  const [mediaItems, setMediaItems] = useState<ProductMediaItem[]>([]);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [mediaPreview, setMediaPreview] = useState<{ kind: "thumbnail" | "promotional_video"; url: string; local: boolean } | null>(() => product?.promotionalVideoUrl
    ? { kind: "promotional_video", url: product.promotionalVideoUrl, local: false }
    : product?.imageRefs?.[0] ? { kind: "thumbnail", url: product.imageRefs[0], local: false } : null);
  const thumbnailInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/admin/products/${product._id}/assets`, { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(async (response) => {
        const result = await response.json() as ApiResult<Asset[]>;
        if (response.ok && Array.isArray(result.data)) setAssets(result.data.flatMap((asset) => isRecord(asset) && typeof asset.id === "string" && typeof asset.version === "string" && typeof asset.fileName === "string" && typeof asset.status === "string" && typeof asset.sizeBytes === "number" ? [{ id: asset.id, version: asset.version, fileName: asset.fileName, status: asset.status, sizeBytes: asset.sizeBytes }] : []));
      }),
      fetch(`/api/admin/products/${product._id}/media`, { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(async (response) => {
        const result = await response.json() as ApiResult<ProductMediaItem[]>;
        if (response.ok && Array.isArray(result.data)) setMediaItems(result.data.filter((item) => isRecord(item) && typeof item.id === "string" && (item.kind === "thumbnail" || item.kind === "promotional_video") && typeof item.status === "string" && typeof item.fileName === "string" && typeof item.contentType === "string" && typeof item.sizeBytes === "number") as ProductMediaItem[]);
      }),
    ]).catch(() => undefined);
    return () => controller.abort();
  }, [product]);

  useEffect(() => () => { if (mediaPreview?.local) URL.revokeObjectURL(mediaPreview.url); }, [mediaPreview]);

  async function uploadMedia(file: File, kind: "thumbnail" | "promotional_video") {
    if (!product?._id || !product.canManage) {
      setMediaError("Save the product draft before uploading media.");
      return;
    }
    setMediaError("");
    const localPreview = URL.createObjectURL(file);
    setMediaPreview((previous) => { if (previous?.local) URL.revokeObjectURL(previous.url); return { kind, url: localPreview, local: true }; });
    setMediaProgress(0);
    try {
      const intentResponse = await fetch(`/api/admin/products/${product._id}/media/uploads`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, fileName: file.name, contentType: file.type, sizeBytes: file.size }),
      });
      const intent = await intentResponse.json() as ApiResult<{ mediaId: string; uploadUrl: string; headers: Record<string, string> }>;
      if (!intentResponse.ok || !intent.success || !intent.data) throw new Error(readError(intent, "The upload could not be started."));
      await uploadFileToR2(intent.data.uploadUrl, intent.data.headers, file, setMediaProgress);
      const completeResponse = await fetch(`/api/admin/products/${product._id}/media/uploads/${intent.data.mediaId}/complete`, { method: "POST", credentials: "same-origin" });
      const completed = await completeResponse.json() as ApiResult<ProductMediaItem>;
      if (!completeResponse.ok || !completed.success || !completed.data?.publicUrl) throw new Error(readError(completed, "The media could not be verified or published."));
      if (mediaPreview?.local) URL.revokeObjectURL(mediaPreview.url);
      setMediaPreview({ kind, url: completed.data.publicUrl, local: false });
      if (kind === "thumbnail") setImageRefs((current) => [completed.data!.publicUrl!, ...current.split("\n").map((value) => value.trim()).filter((value) => value && value !== completed.data!.publicUrl)].join("\n"));
      else setPromotionalVideoUrl(completed.data.publicUrl);
      setMediaItems((current) => [completed.data!, ...current]);
      setMessageStatus("success");
      setMessage(kind === "thumbnail" ? "Thumbnail uploaded and saved." : "Promotional video uploaded and saved.");
    } catch (cause) {
      setMediaError(cause instanceof Error ? cause.message : "The media could not be uploaded.");
      if (mediaPreview?.local) URL.revokeObjectURL(mediaPreview.url);
      setMediaPreview(null);
    } finally { setMediaProgress(null); }
  }

  async function chooseSavedMedia(kind: "thumbnail" | "promotional_video", mediaId: string) {
    if (!product?._id) return;
    const response = await fetch(`/api/admin/products/${product._id}/media`, { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, mediaId: mediaId || null }) });
    const result = await response.json() as ApiResult<unknown>;
    if (!response.ok || !result.success) { setMediaError(readError(result, "The media selection could not be saved.")); return; }
    const media = mediaItems.find((item) => item.id === mediaId && item.kind === kind);
    if (kind === "thumbnail") setImageRefs(media?.publicUrl ? [media.publicUrl, ...imageRefs.split("\n").slice(1)].join("\n") : imageRefs.split("\n").slice(1).join("\n"));
    else setPromotionalVideoUrl(media?.publicUrl ?? "");
    setMediaPreview(media?.publicUrl ? { kind, url: media.publicUrl, local: false } : null);
    setMediaError("");
    setMessageStatus("success");
    setMessage(mediaId ? "Media selection saved." : "The media reference was removed from the product. The cloud file was retained.");
  }

  function updateName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 180));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setMessageStatus("error"); onError("");
    const form = new FormData(event.currentTarget);
    const pricePaise = amountToPaise(String(form.get("price") ?? ""));
    const compareText = String(form.get("compareAtPrice") ?? "").trim();
    const compareAtPricePaise = compareText ? amountToPaise(compareText) : undefined;
    if (pricePaise === null || (compareText && compareAtPricePaise === null)) { setMessage("Enter the price in rupees with no more than two decimal places."); setBusy(false); return; }
    const textList = (key: string) => String(form.get(key) ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
    const categoryIds = selectedCategoryIds;
    const includedProductIds = form.getAll("includedProductIds").map(String);
    const faqLines = textList("faqs");
    const faqs = faqLines.map((line) => { const split = line.indexOf("|"); return split > 0 ? { question: line.slice(0, split).trim(), answer: line.slice(split + 1).trim() } : null; });
    if (faqs.some((faq) => !faq)) { setMessage("Enter each FAQ on a separate line as question | answer."); setBusy(false); return; }
    const payload: Record<string, unknown> = {
      name, slug: slug || undefined, shortDescription: String(form.get("shortDescription") ?? ""), description: String(form.get("description") ?? ""),
      pricePaise, imageRefs: textList("imageRefs"),
      features: textList("features"), benefits: textList("benefits"), includedContent: textList("includedContent"), faqs,
      categoryIds, featured: form.get("featured") === "on", displayOrder: Number(form.get("displayOrder") ?? 0),
      seo: { title: String(form.get("seoTitle") ?? "").trim() || undefined, description: String(form.get("seoDescription") ?? "").trim() || undefined },
    };
    if (compareAtPricePaise !== undefined && compareAtPricePaise !== null) payload.compareAtPricePaise = compareAtPricePaise;
    else if (product) payload.compareAtPricePaise = null;
    const promotionalVideoUrl = String(form.get("promotionalVideoUrl") ?? "").trim();
    if (promotionalVideoUrl) payload.promotionalVideoUrl = promotionalVideoUrl;
    else if (product) payload.promotionalVideoUrl = null;
    if (!product) {
      payload.productType = type;
      if (type === "pdf_bundle") { payload.bundleKind = String(form.get("bundleKind")); payload.includedProductIds = includedProductIds; }
      if (type === "call_guidance") { payload.callDurationMinutes = Number(form.get("callDurationMinutes") ?? 0); payload.fulfilmentInstructions = String(form.get("fulfilmentInstructions") ?? ""); }
    } else if (type === "pdf_bundle") payload.includedProductIds = includedProductIds;
    else if (type === "call_guidance") { payload.callDurationMinutes = Number(form.get("callDurationMinutes") ?? 0); payload.fulfilmentInstructions = String(form.get("fulfilmentInstructions") ?? ""); }
    if (product && type === "pdf") payload.primaryAssetId = assetId || null;
    try {
      const endpoint = product ? `/api/admin/products/${product._id}` : "/api/admin/products";
      const response = await fetch(endpoint, { method: product ? "PATCH" : "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as ApiResult<AdminProduct>;
      if (!response.ok || !result.success || !result.data) throw new Error(readError(result, "The product could not be saved."));
      const saved = result.data;
      const file = form.get("pdfFile");
      if (file instanceof File && file.size) {
        const upload = new FormData(); upload.set("file", file);
        const uploaded = await fetch(`/api/admin/products/${saved._id}/assets`, { method: "POST", credentials: "same-origin", body: upload });
        const uploadResult = await uploaded.json() as ApiResult<Asset>;
        if (!uploaded.ok || !uploadResult.success) {
          await onSaved(`Product draft created, but the PDF could not be uploaded: ${readError(uploadResult, "Edit the product and upload the PDF again.")}`);
          return;
        }
      }
      await onSaved(product ? "Product changes save ho gaye." : "Product draft create ho gaya.");
    } catch (cause) { const text = cause instanceof Error ? cause.message : "The product could not be saved."; setMessage(text); onError(text); }
    finally { setBusy(false); }
  }

  return <AccessibleOverlay open onClose={onClose} titleId="product-editor-title" descriptionId="product-editor-description">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-accent-foreground">PRODUCT EDITOR</p><h2 id="product-editor-title" className="mt-2 text-2xl font-semibold text-foreground">{product ? "Edit product" : "New product"}</h2><p id="product-editor-description" className="mt-2 text-sm leading-6 text-foreground-secondary">Saving keeps the product as a draft. Check its category, price, and delivery details before publishing.</p></div><button type="button" onClick={onClose} aria-label="Close editor" className="grid size-11 shrink-0 place-items-center rounded-full border border-border text-lg text-foreground-secondary hover:bg-background">×</button></div>
      <form onSubmit={(event) => void save(event)} className="mt-7 grid gap-5 sm:grid-cols-2">
        <label className={labelClass}>Product title<input required maxLength={160} className={inputClass} value={name} onChange={(event) => updateName(event.target.value)} /></label>
        <label className={labelClass}>Slug<input required maxLength={180} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={inputClass} value={slug} onChange={(event) => { setSlug(event.target.value); setSlugEdited(true); }} /></label>
        <label className={labelClass}>Product type<select className={inputClass} value={type} disabled={Boolean(product)} onChange={(event) => setType(event.target.value as ProductType)}><option value="pdf">PDF</option><option value="pdf_bundle">PDF Bundle</option><option value="call_guidance">Consultant Call</option></select>{product && <span className="text-xs font-normal text-foreground-secondary">Product type cannot change because existing orders retain their original details.</span>}</label>
        {type === "pdf_bundle" && <label className={labelClass}>Bundle label<select name="bundleKind" required className={inputClass} defaultValue={product?.bundleKind ?? "bundle"}><option value="starter_kit">Starter Kit</option><option value="bundle">Bundle</option></select></label>}
        <label className={`${labelClass} sm:col-span-2`}>Short description<input required maxLength={280} name="shortDescription" defaultValue={product?.shortDescription ?? ""} className={inputClass} /></label>
        <label className={`${labelClass} sm:col-span-2`}>Full description<textarea name="description" maxLength={20000} rows={5} defaultValue={product?.description ?? ""} className={`${inputClass} py-3`} /></label>
        <label className={labelClass}>Selling price (₹)<input required name="price" inputMode="decimal" placeholder="0.00" defaultValue={rupees(product?.pricePaise)} className={inputClass} /></label>
        <label className={labelClass}>Compare-at price (₹)<input name="compareAtPrice" inputMode="decimal" placeholder="Optional" defaultValue={rupees(product?.compareAtPricePaise)} className={inputClass} /></label>
        <ProductCategoryPicker categories={categories} productCategoryIds={product?.categoryIds ?? []} selectedIds={selectedCategoryIds} loadState={categoryLoadState} loadError={categoryLoadError} onChange={setSelectedCategoryIds} onRetry={onRetryCategories} />
        <div className={`${labelClass} sm:col-span-2`}>
          <span>Product thumbnail (optional)</span>
          {mediaPreview?.kind === "thumbnail" && <div className="relative aspect-video max-w-sm overflow-hidden rounded-xl border border-border bg-background">{mediaPreview.local || mediaPreview.url.startsWith("https://") ? <Image src={mediaPreview.url} alt="Selected product thumbnail preview" fill sizes="(max-width: 640px) 100vw, 384px" unoptimized className="object-contain" /> : null}</div>}
          <textarea name="imageRefs" rows={2} value={imageRefs} onChange={(event) => setImageRefs(event.target.value)} className={`${inputClass} py-3`} placeholder="Optional existing HTTPS image reference; one per line" aria-label="Thumbnail image references" />
          <div className="flex flex-wrap gap-2"><input ref={thumbnailInput} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="sr-only" aria-label="Choose a thumbnail image file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file, "thumbnail"); event.currentTarget.value = ""; }} /><button type="button" disabled={mediaProgress !== null} onClick={() => thumbnailInput.current?.click()} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-50">Upload Thumbnail</button>
            <select aria-label="Select an existing uploaded thumbnail" value="" onChange={(event) => { if (event.target.value) void chooseSavedMedia("thumbnail", event.target.value); }} className={`${inputClass} w-auto`}><option value="">Choose saved thumbnail...</option>{mediaItems.filter((item) => item.kind === "thumbnail" && item.status === "ready" && item.publicUrl).map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}</select>
            <button type="button" onClick={() => { if (window.confirm("Remove the product thumbnail reference? The stored media file will remain available.")) void chooseSavedMedia("thumbnail", ""); }} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-foreground-secondary hover:bg-background">Remove thumbnail</button></div>
          {!product && <p className="text-xs font-normal text-foreground-secondary">Save this draft first to enable cloud uploads. No file is uploaded until you select one.</p>}
          {mediaProgress !== null && mediaPreview?.kind === "thumbnail" && <div role="status" aria-live="polite"><progress className="w-full" max={100} value={mediaProgress} /><span className="text-xs text-foreground-secondary">Uploading and verifying: {mediaProgress}%</span></div>}
          {!mediaPreview?.kind && !imageRefs && <p className="text-xs text-foreground-secondary">No thumbnail is set; catalogue cards will show the branded fallback.</p>}
        </div>
        <div className={`${labelClass} sm:col-span-2`}>
          <span>Promotional video (optional)</span>
          {mediaPreview?.kind === "promotional_video" && <video src={mediaPreview.url} controls preload="none" playsInline className="aspect-video max-w-xl rounded-xl border border-border bg-black" poster={imageRefs.split("\n")[0] || undefined} aria-label="Selected promotional video preview" />}
          <input type="url" name="promotionalVideoUrl" placeholder="https://... (existing references remain supported)" value={promotionalVideoUrl} onChange={(event) => setPromotionalVideoUrl(event.target.value)} className={inputClass} />
          <div className="flex flex-wrap gap-2"><input ref={videoInput} type="file" accept="video/mp4,video/webm,.mp4,.webm" className="sr-only" aria-label="Choose a promotional video file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file, "promotional_video"); event.currentTarget.value = ""; }} /><button type="button" disabled={mediaProgress !== null} onClick={() => videoInput.current?.click()} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-50">Upload Promotional Video</button>
            <select aria-label="Select an existing uploaded promotional video" value="" onChange={(event) => { if (event.target.value) void chooseSavedMedia("promotional_video", event.target.value); }} className={`${inputClass} w-auto`}><option value="">Choose saved video...</option>{mediaItems.filter((item) => item.kind === "promotional_video" && item.status === "ready" && item.publicUrl).map((item) => <option key={item.id} value={item.id}>{item.fileName}</option>)}</select>
            <button type="button" onClick={() => { if (window.confirm("Remove the promotional video reference? The stored media file will remain available.")) void chooseSavedMedia("promotional_video", ""); }} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-foreground-secondary hover:bg-background">Remove video</button></div>
          {mediaProgress !== null && mediaPreview?.kind === "promotional_video" && <p role="status" aria-live="polite" className="text-xs text-foreground-secondary">Uploading and verifying: {mediaProgress}%</p>}
          <p className="text-xs font-normal text-foreground-secondary">MP4 and WebM only. Preview stays paused until Play; the product video is marketing media, not a paid download.</p>
        </div>
        {mediaError && <p className="sm:col-span-2 rounded-xl border border-red-700/20 bg-red-500/10 px-4 py-3 text-sm text-foreground" role="alert">{mediaError}</p>}
        {type === "pdf" && <>
          <label className={`${labelClass} sm:col-span-2`}>Private PDF asset<select className={inputClass} value={assetId} onChange={(event) => setAssetId(event.target.value)}><option value="">{assets.length ? "Select an asset" : "No PDF assets available"}</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName} · {asset.version.slice(0, 8)} · {asset.status}</option>)}</select><span className="text-xs font-normal text-foreground-secondary">The master PDF stays in the private R2 bucket. Customers do not receive a public URL here.</span></label>
          <label className={`${labelClass} sm:col-span-2`}>PDF upload<input type="file" name="pdfFile" accept="application/pdf,.pdf" className={`${inputClass} py-2`} /><span className="text-xs font-normal text-foreground-secondary">A new upload becomes the active version. Previous versions remain available for purchase history.</span></label>
        </>}
        {type === "pdf_bundle" && <label className={`${labelClass} sm:col-span-2`}>PDF products in this bundle<select multiple name="includedProductIds" required defaultValue={product?.includedProductIds ?? []} className={`${inputClass} h-36 py-2`}>{products.filter((item) => item.productType === "pdf" && item.publicationStatus !== "archived" && item._id !== product?._id).map((item) => <option key={item._id} value={item._id}>{item.name} · {statusLabels[item.publicationStatus]}</option>)}</select><span className="text-xs font-normal text-foreground-secondary">Select separate PDF products. Nested bundles and Consultant Calls are not supported.</span></label>}
        {type === "call_guidance" && <><label className={labelClass}>Call duration (minutes)<input type="number" min={1} max={480} name="callDurationMinutes" required defaultValue={product?.callDurationMinutes ?? 45} className={inputClass} /></label><label className={`${labelClass} sm:col-span-2`}>Fulfilment instructions<textarea name="fulfilmentInstructions" required maxLength={4000} rows={3} defaultValue={product?.fulfilmentInstructions ?? ""} className={`${inputClass} py-3`} /></label></>}
        <label className={`${labelClass} sm:col-span-2`}>Features (one per line)<textarea name="features" rows={3} defaultValue={product?.features?.join("\n")} className={`${inputClass} py-3`} /></label>
        <label className={`${labelClass} sm:col-span-2`}>Benefits (one per line)<textarea name="benefits" rows={3} defaultValue={product?.benefits?.join("\n")} className={`${inputClass} py-3`} /></label>
        <label className={`${labelClass} sm:col-span-2`}>Included content (one per line)<textarea name="includedContent" rows={3} defaultValue={product?.includedContent?.join("\n")} className={`${inputClass} py-3`} /></label>
        <label className={`${labelClass} sm:col-span-2`}>FAQs (har line: question | answer)<textarea name="faqs" rows={4} defaultValue={product?.faqs?.map((faq) => `${faq.question} | ${faq.answer}`).join("\n")} className={`${inputClass} py-3`} /></label>
        <label className={`${labelClass} sm:col-span-2`}>SEO title<input name="seoTitle" maxLength={70} defaultValue={product?.seo?.title ?? ""} className={inputClass} /></label>
        <label className={`${labelClass} sm:col-span-2`}>SEO description<textarea name="seoDescription" maxLength={180} rows={2} defaultValue={product?.seo?.description ?? ""} className={`${inputClass} py-3`} /></label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-foreground"><input type="checkbox" name="featured" defaultChecked={product?.featured ?? false} className="size-4 accent-primary" />Featured product</label>
        <label className={labelClass}>Display order<input type="number" name="displayOrder" min={0} max={1000000} defaultValue={product?.displayOrder ?? 0} className={inputClass} /></label>
        {message && <p className={`sm:col-span-2 rounded-xl border px-4 py-3 text-sm text-foreground ${messageStatus === "success" ? "border-emerald-700/20 bg-emerald-500/10" : "border-red-700/20 bg-red-500/10"}`} role={messageStatus === "success" ? "status" : "alert"}>{message}</p>}
        <div className="sm:col-span-2 flex flex-wrap justify-end gap-3 border-t border-border pt-5"><button type="button" onClick={onClose} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-foreground">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-full bg-primary px-6 text-sm font-semibold text-background hover:bg-primary-hover disabled:opacity-50">{busy ? "Saving…" : "Save draft"}</button></div>
      </form>
  </AccessibleOverlay>;
}
