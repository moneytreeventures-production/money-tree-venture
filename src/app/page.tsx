import { Suspense } from "react";
import type { Metadata } from "next";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";

import HeroSection from "@/components/home/hero-section";
import { HomeReviews } from "@/components/home/home-reviews";
import FeaturedProducts from "@/components/home/featured-products";
import { FeaturedProductsSkeleton } from "@/components/ui/skeleton";
import HowItWorks from "@/components/home/how-it-works";
import TrustSection from "@/components/home/trust-section";
import HomeGuidance from "@/components/home/home-guidance";
import { publicSiteOrigin } from "@/lib/seo/site-url";

export const metadata: Metadata = { alternates: { canonical: "/" }, openGraph: { url: "/" } };
import HomeScrollGlow from "@/components/home/home-scroll-glow";

export default function Home() {
  const origin = publicSiteOrigin();
  const structuredData = origin ? JSON.stringify({ "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", name: "Money Tree Venture", url: origin, logo: `${origin}/icon.png` },
    { "@type": "WebSite", name: "Money Tree Venture", url: origin, publisher: { "@type": "Organization", name: "Money Tree Venture", url: origin } },
  ] }).replace(/</g, "\\u003c") : null;
  return (
    <div className="mt-homepage relative isolate flex min-h-screen flex-col">
      {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />}
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
