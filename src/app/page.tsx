import { Suspense } from "react";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";

import HeroSection from "@/components/home/hero-section";
import { HomeReviews } from "@/components/home/home-reviews";
import FeaturedProducts from "@/components/home/featured-products";
import { FeaturedProductsSkeleton } from "@/components/ui/skeleton";
import HowItWorks from "@/components/home/how-it-works";
import TrustSection from "@/components/home/trust-section";
import HomeGuidance from "@/components/home/home-guidance";
import HomeScrollGlow from "@/components/home/home-scroll-glow";

export default function Home() {
  return (
    <div className="mt-homepage relative isolate flex min-h-screen flex-col">
      <HomeScrollGlow />
      <div className="relative z-10 flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <HeroSection />
        <Suspense fallback={<FeaturedProductsSkeleton />}><FeaturedProducts /></Suspense>
        <TrustSection />
        <HowItWorks />
        <Suspense fallback={null}><HomeReviews /></Suspense>
        <HomeGuidance />
      </main>

      <Footer />
      </div>
    </div>
  );
}
