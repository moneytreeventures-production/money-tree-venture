import { Suspense } from "react";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";

import HeroSection from "@/components/home/hero-section";
import { HomeReviews } from "@/components/home/home-reviews";
import FeaturedProducts from "@/components/home/featured-products";
import HowItWorks from "@/components/home/how-it-works";
import TrustSection from "@/components/home/trust-section";

export default function Home() {
  return (
    <>
      <Navbar />

      <main className="flex-1">
        <HeroSection />
        <Suspense fallback={<section className="px-5 py-16" role="status">Loading products...</section>}><FeaturedProducts /></Suspense>
        <HowItWorks />
        <Suspense fallback={null}><HomeReviews /></Suspense>
        <TrustSection />
      </main>

      <Footer />
    </>
  );
}
