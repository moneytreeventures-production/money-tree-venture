import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { Suspense } from "react";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import ProductCatalog from "@/components/catalog/product-catalog";
import { CatalogueSkeleton } from "@/components/ui/skeleton";
import { AmbientGlow } from "@/components/ui/ambient-glow";

export const metadata: Metadata = publicPageMetadata("Digital products", "Browse published PDF guides, Starter Kits, Bundles and 1:1 Call Guidance from Money Tree Venture.", "/products");

export default function ProductsPage() {
  return <><Navbar /><main className="relative flex-1 overflow-hidden"><AmbientGlow /><div className="relative"><Suspense fallback={<CatalogueSkeleton />}><ProductCatalog /></Suspense></div></main><Footer /></>;
}
