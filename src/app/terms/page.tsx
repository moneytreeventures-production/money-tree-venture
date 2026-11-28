import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import Link from "next/link";
import { PublicInfoPage } from "@/components/pages/public-info-page";

export const metadata: Metadata = publicPageMetadata("Terms & Conditions", "Terms for using Money Tree Venture products and services.", "/terms");

export default function TermsPage() {
  return <PublicInfoPage eyebrow="Terms" title="Terms & Conditions" intro="These terms describe use of the Money Tree Venture website and its digital products and online consultation services. " sections={[
    { title: "Products and services", content: <p>You may browse and purchase the PDF guides, PDF bundles and separately offered 1:1 online Call Guidance services shown on the website. Product descriptions, prices and applicable terms are provided before purchase. A consultation is a service with its own booking workflow; it is not a downloadable PDF.</p> },
    { title: "Orders and payment", content: <p>Orders are subject to availability and acceptance through the checkout process. Payment must be verified before paid digital access is granted. Order and payment status can be reviewed from your authenticated account. The tax treatment and billing information are currently under review; see <Link className="underline" href="/billing-information">Billing Information</Link>.</p> },
    { title: "Personal-use licence for PDF products", content: <p>Unless a product page states otherwise, purchased PDF products are licensed to the purchaser for personal, non-commercial use. You may not redistribute, resell, publicly share, reproduce without authorization or commercially exploit the materials. Money Tree Venture or its licensors retain applicable intellectual-property rights.</p> },
    { title: "Educational information and outcomes", content: <p>Educational and informational materials are general resources. They do not guarantee earnings, business results, employment, or any specific personal or professional outcome.</p> },
    { title: "Consultation bookings", content: <p>1:1 Call Guidance uses a separate account-based booking process. Review its product description and available scheduling details before purchasing. Contact support for cancellation or rescheduling requests; a booking change does not itself confirm a refund.</p> },
    { title: "Consumer rights and changes", content: <p>Nothing in these terms is intended to exclude or restrict a consumer right that cannot lawfully be excluded or restricted. Terms may be updated with a clearly displayed effective date. A later version will not be represented as having applied to earlier purchases unless the law permits that result.</p> },
    { title: "Review before purchase", content: <p>Please review these terms, the product or service description, and the relevant <Link className="underline" href="/refund-policy">Refund &amp; Cancellation Policy</Link> before placing an order. </p> },
  ]} />;
}
