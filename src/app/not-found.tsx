import Link from "next/link";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";

export default function NotFound() {
  return <><Navbar /><main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-5 py-20 text-center">
    <p className="text-sm font-semibold text-accent-foreground">MoneyTreeVentures</p>
    <h1 className="mt-6 text-6xl font-bold">404<span className="mt-4 block text-3xl">Page Not Found</span></h1>
    <p className="mt-5 text-foreground-secondary">The page you requested is unavailable. Explore our products or return to the homepage.</p>
    <div className="mt-8 flex flex-wrap justify-center gap-4">
      <Link href="/" className="inline-flex min-h-12 items-center rounded-full bg-accent px-6 font-semibold text-[#0f1e36] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent">Return Home</Link>
      <Link href="/products" className="inline-flex min-h-12 items-center rounded-full border border-border px-6 font-semibold focus-visible:outline-2 focus-visible:outline-accent">Explore Products</Link>
    </div>
  </main><Footer /></>;
}
