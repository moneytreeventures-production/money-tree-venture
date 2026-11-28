import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import Link from "next/link";
import { PublicInfoPage } from "@/components/pages/public-info-page";

export const metadata: Metadata = publicPageMetadata("Shipping & Delivery Policy", "Digital delivery information for Money Tree Venture products and online consultations.", "/shipping-delivery");

export default function ShippingDeliveryPage() {
  return <PublicInfoPage eyebrow="Digital delivery" title="Shipping & Delivery Policy" intro="Money Tree Venture does not ship physical goods. Digital products and online consultation services follow separate delivery workflows." sections={[
    { title: "No physical shipping", content: <p>PDF guides and PDF bundles are digital products. No physical parcel or courier shipment is included.</p> },
    { title: "PDF access through My Library", content: <p>After Cashfree payment has been verified and the purchase access is available, sign in and open <Link className="underline" href="/account/library">My Library</Link>. Protected PDFs are delivered through the authenticated download service; you must be signed in. We do not send PDF masters as email attachments or provide public, transferable download links.</p> },
    { title: "Payment or access problem", content: <p>If a verified payment does not appear in your account or a file cannot be accessed, check My Library and then contact <Link className="underline" href="/contact#support-form">support</Link> with your order reference. Some access issues require additional investigation and may take up to 24 hours or longer to address; this is an estimate, not a guaranteed delivery or resolution time. Please report a failed delivery promptly.</p> },
    { title: "1:1 online consultations", content: <p>Call Guidance is a separate online service and does not receive automatic PDF download access. After verified purchase, its booking instructions and status appear in your account. Scheduling and confirmation follow the consultation booking workflow.</p> },
    { title: "Email notifications", content: <p>Email notifications are not the secure delivery mechanism. Transactional email delivery is still being verified; check your account for order and access information.</p> },
  ]} />;
}
