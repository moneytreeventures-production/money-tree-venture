import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoPage } from "@/components/pages/public-info-page";

export const metadata: Metadata = { title: "About", description: "Learn about MoneyTreeVentures and its digital learning resources.", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return <PublicInfoPage eyebrow="About Money Tree Venture" title="Learn More. Explore More. Grow More." intro="Money Tree Venture is an independent digital platform dedicated to useful, affordable and easy-to-understand digital resources." sections={[
    { title: "Our purpose", content: <p>Our goal is to make valuable information, learning materials and practical guides accessible through simple digital products. We believe useful knowledge should be easy to access, affordable and available when you need it.</p> },
    { title: "What you can explore", content: <p>Browse individual PDF guides and PDF bundles, or explore our separate 1:1 online Call Guidance consultations. Each product page explains what that offering includes.</p> },
    { title: "Explore products", content: <p><Link href="/products" className="font-semibold text-accent-foreground underline underline-offset-4">Explore Products</Link></p> },
    { title: "Business name", content: <p>This website operates under the name Money Tree Venture. The registered legal entity name, if applicable, has not been confirmed.</p> },
  ]} />;
}
