import type { Product } from "../db/models/catalog";

export interface PublicProductView {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  productType: Product["productType"];
  bundleKind?: Product["bundleKind"];
  categoryIds: string[];
  pricePaise: number;
  compareAtPricePaise?: number;
  currency: "INR";
  imageRefs: string[];
  promotionalVideoUrl?: string;
  features: string[];
  benefits: string[];
  includedContent: string[];
  faqs: Array<{ question: string; answer: string }>;
  featured: boolean;
  displayOrder: number;
  seo?: Product["seo"];
  callDurationMinutes?: number;
}

export function toPublicProductView(product: Product & { _id: unknown }): PublicProductView {
  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription,
    description: product.description,
    productType: product.productType,
    ...(product.bundleKind ? { bundleKind: product.bundleKind } : {}),
    categoryIds: product.categoryIds.map(String),
    pricePaise: product.pricePaise,
    ...(product.compareAtPricePaise !== undefined ? { compareAtPricePaise: product.compareAtPricePaise } : {}),
    currency: product.currency,
    imageRefs: product.imageRefs,
    ...(product.promotionalVideoUrl ? { promotionalVideoUrl: product.promotionalVideoUrl } : {}),
    features: product.features ?? [],
    benefits: product.benefits ?? [],
    includedContent: product.includedContent ?? [],
    faqs: product.faqs ?? [],
    featured: product.featured,
    displayOrder: product.displayOrder,
    ...(product.seo && Object.keys(product.seo).length ? { seo: product.seo } : {}),
    ...(product.callDurationMinutes !== undefined ? { callDurationMinutes: product.callDurationMinutes } : {}),
  };
}
