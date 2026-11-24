export type CatalogueProductType = "pdf" | "pdf_bundle" | "call_guidance";
export type CatalogueSort = "newest" | "price_asc" | "price_desc" | "featured";

export interface CatalogueQueryState {
  query: string;
  category: string;
  productType: "" | CatalogueProductType;
  minPrice: string;
  maxPrice: string;
  sort: CatalogueSort;
  page: number;
  invalidRange: boolean;
}

const productTypes = new Set<CatalogueProductType>(["pdf", "pdf_bundle", "call_guidance"]);
const sorts = new Set<CatalogueSort>(["newest", "price_asc", "price_desc", "featured"]);
const pricePattern = /^\d{1,9}(?:\.\d{1,2})?$/;

function priceToPaise(value: string): number {
  const [rupees, paise = ""] = value.split(".");
  return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
}

export function readCatalogueQuery(search: string): CatalogueQueryState {
  const params = new URLSearchParams(search);
  const query = (params.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  const categoryValue = params.get("category") ?? "";
  const category = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categoryValue) ? categoryValue : "";
  const typeValue = params.get("productType") as CatalogueProductType | null;
  const productType = typeValue && productTypes.has(typeValue) ? typeValue : "";
  const minValue = params.get("minPrice") ?? "";
  const maxValue = params.get("maxPrice") ?? "";
  const minPrice = pricePattern.test(minValue) ? minValue : "";
  const maxPrice = pricePattern.test(maxValue) ? maxValue : "";
  const invalidRange = Boolean(minPrice && maxPrice && priceToPaise(minPrice) > priceToPaise(maxPrice));
  const sortValue = params.get("sort") as CatalogueSort | null;
  const sort = sortValue && sorts.has(sortValue) ? sortValue : "featured";
  const pageValue = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 10_000) : 1;
  return {
    query,
    category,
    productType,
    minPrice: invalidRange ? "" : minPrice,
    maxPrice: invalidRange ? "" : maxPrice,
    sort,
    page,
    invalidRange,
  };
}

export function buildCatalogueApiQuery(state: CatalogueQueryState, pageSize = 12): string {
  const params = new URLSearchParams({ page: String(state.page), pageSize: String(pageSize), sort: state.sort });
  if (state.query) params.set("search", state.query);
  if (state.category) params.set("category", state.category);
  if (state.productType) params.set("productType", state.productType);
  if (state.minPrice) params.set("minPrice", state.minPrice);
  if (state.maxPrice) params.set("maxPrice", state.maxPrice);
  return params.toString();
}

export function updateCatalogueSearch(currentSearch: string, updates: Partial<Omit<CatalogueQueryState, "invalidRange">>): string {
  const current = readCatalogueQuery(currentSearch);
  const state = { ...current, ...updates, page: updates.page ?? 1 };
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.category) params.set("category", state.category);
  if (state.productType) params.set("productType", state.productType);
  if (state.minPrice) params.set("minPrice", state.minPrice);
  if (state.maxPrice) params.set("maxPrice", state.maxPrice);
  if (state.sort !== "featured") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}
