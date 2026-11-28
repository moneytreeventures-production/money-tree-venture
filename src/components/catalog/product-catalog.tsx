"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Layers3, PhoneCall, Search, ShoppingBag } from "lucide-react";
import { SkeletonProductGrid } from "@/components/ui/skeleton";
import { Feedback } from "@/components/ui/feedback";
import { useCart } from "@/components/cart/cart-provider";
import { formatINR } from "@/lib/format/currency";
import { buildCatalogueApiQuery, readCatalogueQuery, updateCatalogueSearch, type CatalogueProductType } from "@/lib/catalog/catalogue-query";

type ProductType = CatalogueProductType;
interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  productType: ProductType;
  bundleKind?: "starter_kit" | "bundle";
  categoryIds: string[];
  pricePaise: number;
  compareAtPricePaise?: number;
  currency: "INR";
  featured: boolean;
  callDurationMinutes?: number;
  imageRefs: string[];
}
interface PublicCategory { _id: string; name: string; slug: string; status: "active" }
interface ProductListResponse {
  success: boolean;
  data?: { items: PublicProduct[]; pagination: { page: number; totalPages: number; total: number } };
  error?: { message?: string };
}
interface CategoryListResponse { success: boolean; data?: { items: PublicCategory[] }; error?: { message?: string } }

const inputClass = "mt-field px-3 text-sm";
const productKinds: Array<{ value: "" | ProductType; label: string }> = [
  { value: "", label: "All product types" },
  { value: "pdf", label: "Individual PDF" },
  { value: "pdf_bundle", label: "PDF bundles and starter kits" },
  { value: "call_guidance", label: "1:1 Call Guidance" },
];

function productTypeLabel(product: PublicProduct): string {
  if (product.productType === "pdf") return "PDF GUIDE";
  if (product.productType === "call_guidance") return "1:1 CALL GUIDANCE";
  return product.bundleKind === "starter_kit" ? "PDF STARTER KIT" : "PDF BUNDLE";
}

function productIcon(type: ProductType) {
  if (type === "call_guidance") return PhoneCall;
  if (type === "pdf_bundle") return Layers3;
  return BookOpen;
}

function safeImageSource(reference?: string): string | undefined {
  if (!reference) return undefined;
  if (reference.startsWith("/") && !reference.startsWith("//") && !reference.includes("\\")) return reference;
  try {
    const url = new URL(reference);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function ProductThumbnail({ product }: { product: PublicProduct }) {
  const [unavailable, setUnavailable] = useState(false);
  const source = safeImageSource(product.imageRefs?.[0]);
  return (
    <Link href={`/products/${encodeURIComponent(product.slug)}`} aria-label={`View ${product.name} details`} className="relative block aspect-[1.55/1] overflow-hidden bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent">
      {source && !unavailable ? <Image src={source} alt={`${product.name} thumbnail`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" unoptimized className="object-cover transition-transform duration-300 group-hover:scale-[1.025]" onError={() => setUnavailable(true)} /> : <div aria-hidden="true" className="grid h-full place-items-center bg-[linear-gradient(135deg,#e8edf3,#f4e4d8)]"><span className="grid size-16 place-items-center rounded-2xl border border-[#0f1e36]/10 bg-white/80 text-2xl font-semibold text-[#0f1e36]">{product.name.slice(0, 1).toUpperCase()}</span></div>}
      <span className="absolute left-4 top-4 rounded-full border border-white/60 bg-white/90 px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-[#0f1e36]">{productTypeLabel(product)}</span>
    </Link>
  );
}

export default function ProductCatalog() {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return <ProductCatalogContents key={search} search={search} />;
}

function ProductCatalogContents({ search }: { search: string }) {
  const { addItem, count, items: cartItems, ready } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const urlKey = search;
  const urlState = readCatalogueQuery(urlKey);
  const apiQuery = buildCatalogueApiQuery(urlState);
  const [searchDraft, setSearchDraft] = useState(urlState.query);
  const [minPriceDraft, setMinPriceDraft] = useState(urlState.minPrice);
  const [maxPriceDraft, setMaxPriceDraft] = useState(urlState.maxPrice);
  const [items, setItems] = useState<PublicProduct[]>([]);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [reloadCategories, setReloadCategories] = useState(0);
  const [filterError, setFilterError] = useState(urlState.invalidRange ? "The URL price range was invalid and has been ignored." : "");
  const [notice, setNotice] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!filtersOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setFiltersOpen(false);
      filtersButton.current?.focus();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [filtersOpen]);

  useEffect(() => {
    const controller = new AbortController();
    // The response state belongs to this URL, so the loading transition is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(`/api/products?${apiQuery}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as ProductListResponse;
        if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message ?? "Published resources could not be loaded.");
        setItems(payload.data.items);
        setTotal(payload.data.pagination.total);
        setTotalPages(payload.data.pagination.totalPages);
        if (payload.data.pagination.page !== urlState.page) {
          const corrected = updateCatalogueSearch(urlKey, { page: payload.data.pagination.page });
          router.replace(corrected ? `${pathname}?${corrected}` : pathname, { scroll: false });
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Published resources could not be loaded.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiQuery, pathname, reload, router, urlKey, urlState.page]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategoriesLoading(true);
    setCategoriesError("");
    fetch("/api/categories?page=1&pageSize=100", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as CategoryListResponse;
        if (!response.ok || !payload.success || !Array.isArray(payload.data?.items)) throw new Error(payload.error?.message ?? "Categories could not be loaded.");
        setCategories(payload.data.items);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setCategoriesError(reason instanceof Error ? reason.message : "Categories could not be loaded.");
      })
      .finally(() => { if (!controller.signal.aborted) setCategoriesLoading(false); });
    return () => controller.abort();
  }, [reloadCategories]);

  function updateUrl(updates: Parameters<typeof updateCatalogueSearch>[1]) {
    const nextSearch = updateCatalogueSearch(urlKey, updates);
    if (filtersOpen) { filtersButton.current?.focus(); setFiltersOpen(false); }
    router.push(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateUrl({ query: searchDraft.trim().replace(/\s+/g, " ").slice(0, 100) });
  }

  function submitPriceRange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validPrice = (value: string) => !value.trim() || /^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim());
    if (!validPrice(minPriceDraft) || !validPrice(maxPriceDraft)) {
      setFilterError("Enter an INR amount with up to two decimal places.");
      return;
    }
    const toPaise = (value: string) => {
      const [rupees, paise = ""] = value.trim().split(".");
      return Number(rupees || 0) * 100 + Number(paise.padEnd(2, "0"));
    };
    if (minPriceDraft && maxPriceDraft && toPaise(minPriceDraft) > toPaise(maxPriceDraft)) {
      setFilterError("Minimum price cannot be higher than maximum price.");
      return;
    }
    setFilterError("");
    updateUrl({ minPrice: minPriceDraft.trim(), maxPrice: maxPriceDraft.trim() });
  }

  function clearFilters() {
    setFilterError("");
    if (filtersOpen) { filtersButton.current?.focus(); setFiltersOpen(false); }
    router.push(pathname, { scroll: false });
  }

  function addProduct(product: PublicProduct) {
    const added = addItem(product.id);
    setNotice(added ? `${product.name} was added to your cart.` : "Your cart limit has been reached. Review your cart.");
  }

  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category._id, category.name])), [categories]);
  const activeFilters = [
    urlState.category && (categories.find((category) => category.slug === urlState.category)?.name ?? urlState.category),
    urlState.productType && productKinds.find((kind) => kind.value === urlState.productType)?.label,
    urlState.sort !== "featured" && (urlState.sort === "newest" ? "Newest" : urlState.sort === "price_asc" ? "Price: low to high" : "Price: high to low"),
    urlState.minPrice && `From ₹${urlState.minPrice}`,
    urlState.maxPrice && `Up to ₹${urlState.maxPrice}`,
  ].filter((label): label is string => Boolean(label));
  const hasActiveSearch = Boolean(urlState.query || activeFilters.length);

  return (
    <section className="mt-container py-12 sm:py-16 lg:py-20">
      <div className="flex flex-col justify-between gap-6 border-b border-border pb-8 sm:flex-row sm:items-end">
        <div className="max-w-3xl">
          <p className="mt-eyebrow">MONEY TREE VENTURE · PRODUCTS</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-foreground [text-wrap:balance] sm:text-5xl lg:text-6xl">Choose a resource for your next step.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-foreground-secondary sm:text-base">Browse published PDF guides, PDF bundles, starter kits and 1:1 Call Guidance. Details and prices come from the live catalogue.</p>
        </div>
        <Link href="/cart" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><ShoppingBag size={17} aria-hidden="true" /> Cart ({count})</Link>
      </div>

      <div className="mt-card mt-7 grid gap-4 p-4 sm:p-5">
        <form role="search" onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="catalogue-search" className="sr-only">Search products</label>
          <input id="catalogue-search" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} maxLength={100} placeholder="Search product name or description" className={`${inputClass} min-w-0 flex-1`} />
          <button type="submit" className="mt-button mt-button-primary rounded-xl px-5"><Search size={16} aria-hidden="true" /> Search</button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 lg:hidden">
          <button ref={filtersButton} type="button" aria-expanded={filtersOpen} aria-controls="catalogue-filter-panel" onClick={() => setFiltersOpen((open) => !open)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent">
            Filters{activeFilters.length ? ` (${activeFilters.length})` : ""} <ChevronDown size={16} aria-hidden="true" className={filtersOpen ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          {hasActiveSearch && <button type="button" onClick={clearFilters} className="min-h-11 text-sm font-semibold text-accent-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">Clear filters</button>}
        </div>
        {hasActiveSearch && <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-secondary" aria-label="Active search and filters">
          <span className="font-semibold">Active:</span>{urlState.query && <span className="rounded-full border border-border px-2.5 py-1">Search: {urlState.query}</span>}{activeFilters.map((label) => <span key={label} className="rounded-full border border-border px-2.5 py-1">{label}</span>)}
        </div>}
        <div id="catalogue-filter-panel" className={filtersOpen ? "grid gap-4 border-t border-border pt-4 lg:grid-cols-2 xl:grid-cols-4" : "hidden gap-4 lg:grid lg:grid-cols-2 xl:grid-cols-4"}>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground-secondary">Category
            <select aria-label="Filter by category" value={urlState.category} disabled={categoriesLoading || Boolean(categoriesError)} onChange={(event) => updateUrl({ category: event.target.value })} className={inputClass}>
              <option value="">All categories</option>{categories.map((category) => <option key={category._id} value={category.slug}>{category.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground-secondary">Product type
            <select aria-label="Product type" value={urlState.productType} onChange={(event) => updateUrl({ productType: event.target.value as "" | ProductType })} className={inputClass}>{productKinds.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground-secondary">Sort by
            <select aria-label="Sort by" value={urlState.sort} onChange={(event) => updateUrl({ sort: event.target.value as typeof urlState.sort })} className={inputClass}><option value="featured">Featured</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select>
          </label>
          <form onSubmit={submitPriceRange} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="grid gap-1.5 text-xs font-semibold text-foreground-secondary">Minimum price (₹)<input aria-label="Minimum price (₹)" inputMode="decimal" value={minPriceDraft} onChange={(event) => setMinPriceDraft(event.target.value)} placeholder="No minimum" className={`${inputClass} w-full`} /></label>
            <label className="grid gap-1.5 text-xs font-semibold text-foreground-secondary">Maximum price (₹)<input aria-label="Maximum price (₹)" inputMode="decimal" value={maxPriceDraft} onChange={(event) => setMaxPriceDraft(event.target.value)} placeholder="No maximum" className={`${inputClass} w-full`} /></label>
            <button type="submit" className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-accent">Apply</button>
          </form>
        </div>
        {categoriesError && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-foreground-secondary" role="alert"><span>{`Categories could not be loaded: ${categoriesError}`}</span><button type="button" onClick={() => setReloadCategories((value) => value + 1)} className="min-h-11 rounded-full border border-border px-4 font-semibold text-foreground hover:bg-background focus-visible:outline-2 focus-visible:outline-accent">Retry categories</button></div>}
        {filterError && <p className="text-sm text-red-700 dark:text-red-300" role="alert">{filterError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-foreground-secondary"><span>Prices are in INR. Your order total is confirmed at checkout.</span><button type="button" onClick={clearFilters} className="hidden min-h-11 font-semibold text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent lg:inline-flex lg:items-center">Clear filters</button></div>
      </div>

      <p className={notice ? "rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground" : "sr-only"} role="status" aria-live="polite">{notice}</p>
      {loading && <SkeletonProductGrid label="Loading published resources..." count={6} className="mt-8" />}
      {!loading && error && <Feedback tone="error" className="mt-8" action={<button type="button" onClick={() => setReload((value) => value + 1)} className="min-h-11 font-semibold text-foreground underline underline-offset-4">Retry products</button>}>{error}</Feedback>}
      {!loading && !error && items.length === 0 && <Feedback tone="empty" className="mt-8 text-center" title={hasActiveSearch ? "No products match your search or filters." : "No resources are published yet."}>{hasActiveSearch ? "Try another term or clear your filters." : "Please check back soon."}</Feedback>}
      {!loading && !error && items.length > 0 && <>
        <p className="mt-8 text-xs font-semibold text-foreground-secondary">{`${total} published ${total === 1 ? "resource" : "resources"}`}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((product) => {
            const Icon = productIcon(product.productType);
            const productCategories = [...new Set(product.categoryIds ?? [])].map((id) => categoryNameById.get(id)).filter((name): name is string => Boolean(name));
            return <article key={product.id} className="mt-card mt-card-interactive group flex min-h-full flex-col overflow-hidden bg-background motion-safe:hover:-translate-y-1">
              <ProductThumbnail product={product} />
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <div className="flex items-center gap-2"><Icon size={15} className="text-accent-foreground" aria-hidden="true" /><span className="text-[10px] font-bold tracking-[0.13em] text-accent-foreground">{productTypeLabel(product)}</span>{product.featured && <span className="ml-auto rounded-full bg-accent/15 px-2.5 py-1 text-[9px] font-bold tracking-wide text-foreground">FEATURED</span>}</div>
                {productCategories.length > 0 ? <ul aria-label="Categories" className="mt-3 flex flex-wrap gap-1.5">{productCategories.map((name) => <li key={name} className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-foreground-secondary">{name}</li>)}</ul> : product.categoryIds.length > 0 && <p className="mt-3 text-xs text-foreground-secondary">Unavailable</p>}
                <Link href={`/products/${encodeURIComponent(product.slug)}`} className="mt-2 rounded-sm text-foreground outline-none hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent"><h2 className="text-xl font-semibold leading-tight tracking-[-0.04em] sm:text-[1.35rem]">{product.name}</h2></Link>
                <p className="mt-2 text-sm leading-6 text-foreground-secondary">{product.shortDescription}</p>
                {product.productType === "call_guidance" && product.callDurationMinutes && <p className="mt-3 text-xs font-semibold text-foreground-secondary">{product.callDurationMinutes}-minute 1:1 session</p>}
                <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-border pt-5"><div><p className="text-lg font-semibold text-foreground">{formatINR(product.pricePaise)}</p>{product.compareAtPricePaise !== undefined && product.compareAtPricePaise > product.pricePaise && <p className="text-xs text-foreground-secondary line-through">{formatINR(product.compareAtPricePaise)}</p>}</div><div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end"><Link href={`/products/${encodeURIComponent(product.slug)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">View details</Link>{cartItems.some((item) => item.productId === product.id.toLowerCase()) ? <Link href="/cart" className="inline-flex min-h-11 items-center rounded-full bg-surface-secondary px-4 text-xs font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent">View cart</Link> : <button type="button" disabled={!ready} onClick={() => addProduct(product)} aria-label={`Add to cart: ${product.name}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-4 text-xs font-semibold text-[#0f1e36] transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60">Add to cart <ArrowRight size={14} aria-hidden="true" /></button>}</div></div>
              </div>
            </article>;
          })}
        </div>
        {totalPages > 1 && <nav aria-label="Products" className="mt-8 flex items-center justify-between border-t border-border pt-5"><button type="button" disabled={urlState.page <= 1 || loading} onClick={() => updateUrl({ page: urlState.page - 1 })} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-4 text-sm font-medium text-foreground disabled:opacity-50"><ChevronLeft size={16} /> Previous</button><span className="text-xs text-foreground-secondary">{`Page ${urlState.page} of ${totalPages}`}</span><button type="button" disabled={urlState.page >= totalPages || loading} onClick={() => updateUrl({ page: urlState.page + 1 })} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-4 text-sm font-medium text-foreground disabled:opacity-50">Next <ChevronRight size={16} /></button></nav>}
      </>}
    </section>
  );
}
