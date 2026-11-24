import type { MetadataRoute } from "next";
import { publicSiteOrigin } from "../lib/seo/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicSiteOrigin();
  if (!origin) return [];
  return [
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
}
