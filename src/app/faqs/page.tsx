import type { Metadata } from "next";
import { LocalizedInfoPage } from "@/components/pages/localized-info-page";

export const metadata: Metadata = { title: "FAQs", description: "Common questions about products, digital access and Call Guidance bookings.", alternates: { canonical: "/faqs" } };

export default function FaqsPage() {
  return <LocalizedInfoPage page="faq" />;
}
