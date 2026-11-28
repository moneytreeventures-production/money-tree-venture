import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import { LocalizedInfoPage } from "@/components/pages/localized-info-page";

export const metadata: Metadata = publicPageMetadata("FAQs", "Common questions about products, digital access and Call Guidance bookings.", "/faqs");

export default function FaqsPage() {
  return <LocalizedInfoPage page="faq" />;
}
