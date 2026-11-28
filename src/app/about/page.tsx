import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import Link from "next/link";
import { PublicInfoPage } from "@/components/pages/public-info-page";

export const metadata: Metadata = publicPageMetadata("About", "Learn about Money Tree Venture and its digital learning resources.", "/about");

export default function AboutPage() {
  return <PublicInfoPage eyebrow="About us" title="About Money Tree Venture" intro="Money Tree Venture is a digital learning and resource platform focused on helping people explore practical ideas, build useful skills, and take informed steps toward their personal and professional goals." sections={[
    { title: "Our mission", content: <p>Making useful knowledge more accessible, understandable, and actionable.</p> },
    { title: "What we offer", content: <p>Explore downloadable PDF guides, curated PDF bundles, and separate 1:1 Call Guidance where available. Each listing explains its own scope and delivery.</p> },
    { title: "How it works", content: <p>Review product details before purchasing. When online checkout is available, eligible purchases appear in your account after payment verification. Our support team can help with questions about products, access, and bookings.</p> },
    { title: "Our approach", content: <p>Our resources are for learning and exploration. Results depend on individual circumstances; we do not promise income, employment, or specific outcomes.</p> },
    { title: "Explore products", content: <p><Link href="/products" className="font-semibold text-accent-foreground underline underline-offset-4">Explore Our Products</Link></p> },
  ]} />;
}
