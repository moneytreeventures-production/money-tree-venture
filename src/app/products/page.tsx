import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import ProductCatalog from "@/components/catalog/product-catalog";

export const metadata: Metadata = {
  title: "Digital products",
  description: "Browse published PDF guides, Starter Kits, Bundles and 1:1 Call Guidance from MoneyTreeVentures.",
  alternates: { canonical: "/products" },
};

export default function ProductsPage() {
  return <><Navbar /><main className="flex-1"><Suspense fallback={<div className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-5 text-sm text-foreground-secondary" role="status">Loading catalogue...</div>}><ProductCatalog /></Suspense></main><Footer /></>;
}
