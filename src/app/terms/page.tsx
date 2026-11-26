import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoPage } from "@/components/pages/public-info-page";

export const metadata: Metadata = { title: "Terms & Conditions", description: "Draft MoneyTreeVentures terms and conditions pending owner and legal review.", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return <PublicInfoPage eyebrow="Terms · Draft" title="Terms & Conditions" intro="These draft terms describe use of the MoneyTreeVentures website and its digital products and online consultation services. They are not effective until approved and published with an effective date." draft sections={[
    { title: "Products and services", content: <p>You may browse and purchase the PDF guides, PDF bundles and separately offered 1:1 online Call Guidance services shown on the website. Product descriptions, prices and applicable terms are provided before purchase. A consultation is a service with its own booking workflow; it is not a downloadable PDF.</p> },
    { title: "Orders and payment", content: <p>Orders are subject to availability and acceptance through the checkout process. Payment must be verified before paid digital access is granted. Order and payment status can be reviewed from your authenticated account. The tax treatment and billing information are currently under review; see <Link className="underline" href="/billing-information">Billing Information</Link>.</p> },
    { title: "Personal-use licence for PDF products", content: <p>Unless a product page states otherwise, purchased PDF products are licensed to the purchaser for personal, non-commercial use. You may not redistribute, resell, publicly share, reproduce without authorization or commercially exploit the materials. Money Tree Venture or its licensors retain applicable intellectual-property rights.</p> },
    { title: "Educational information and outcomes", content: <p>Educational and informational materials are general resources. They do not guarantee earnings, business results, employment, or any specific personal or professional outcome.</p> },
    { title: "Consultation bookings", content: <p>Paid online consultations use a separate account-based booking process. Booking status and appointment details are shown in the account. These draft terms do not establish cancellation, rescheduling or refund entitlements for consultations; those terms have not been finalized or published.</p> },
    { title: "Consumer rights and changes", content: <p>Nothing in these terms is intended to exclude or restrict a consumer right that cannot lawfully be excluded or restricted. Terms may be updated with a clearly displayed effective date. A later version will not be represented as having applied to earlier purchases unless the law permits that result.</p> },
    { title: "Review before purchase", content: <p>Please review these terms, the product or service description, and the relevant <Link className="underline" href="/refund-policy">Refund &amp; Cancellation Policy</Link> before placing an order. The terms remain a draft pending qualified Indian legal review.</p> },
  ]} />;
}
