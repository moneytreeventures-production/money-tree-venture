import type { MetadataRoute } from "next";
import { publicSiteOrigin } from "../lib/seo/site-url";
import { connection } from "next/server";
import { connectToDatabase } from "../lib/db/mongodb";
import { ProductModel } from "../lib/db/models";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicSiteOrigin();
  if (!origin) return [];
  const routes: MetadataRoute.Sitemap = [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${origin}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/contact`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${origin}/faqs`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/privacy-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/refund-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/billing-information`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/shipping-delivery`, changeFrequency: "yearly", priority: 0.2 },
  ];
  await connection();
  try {
    await connectToDatabase();
    const products = await ProductModel.find({ publicationStatus: "published" }).select("slug updatedAt").sort({ _id: 1 }).limit(5000).maxTimeMS(3000).lean().exec();
    for (const product of products) {
      if (typeof product.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) routes.push({ url: `${origin}/products/${encodeURIComponent(product.slug)}`, ...(product.updatedAt ? { lastModified: product.updatedAt } : {}) });
    }
  } catch { /* Public route entries remain valid when the catalogue is temporarily unavailable. */ }
  return routes;
}
