import type { Metadata } from "next";

/** Keep public page social cards aligned with their visible title and canonical path. */
export function publicPageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, images: ["/opengraph-image.png"] },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image.png"] },
  };
}
