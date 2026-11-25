import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import ProductCatalog from "@/components/catalog/product-catalog";
import { CatalogueSkeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Digital products",
  description: "Browse published PDF guides, Starter Kits, Bundles and 1:1 Call Guidance from MoneyTreeVentures.",
  alternates: { canonical: "/products" },
};

export default function ProductsPage() {
  return <><Navbar /><main className="flex-1"><Suspense fallback={<CatalogueSkeleton />}><ProductCatalog /></Suspense></main><Footer /></>;
}
