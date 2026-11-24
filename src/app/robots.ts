import type { MetadataRoute } from "next";
import { publicSiteOrigin } from "../lib/seo/site-url";

export default function robots(): MetadataRoute.Robots {
  const origin = publicSiteOrigin();
  return {
    rules: origin
      ? [{ userAgent: "*", allow: "/", disallow: ["/account/", "/admin/", "/api/", "/cart", "/checkout/", "/login"] }]
      : [{ userAgent: "*", disallow: "/" }],
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
