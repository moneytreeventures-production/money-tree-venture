import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoPage } from "@/components/pages/public-info-page";

export const metadata: Metadata = { title: "Refund & Cancellation Policy", description: "Draft refund and cancellation information pending owner and legal review.", alternates: { canonical: "/refund-policy" } };

export default function RefundPolicyPage() {
  return <PublicInfoPage eyebrow="Customer policy · Draft" title="Refund & Cancellation Policy" intro="Digital products are normally provided through an authenticated account after payment verification. This draft explains how to request a review; it does not promise automatic approval or limit rights provided by applicable law." draft sections={[
    { title: "When to request a review", content: <p>You may contact us to request review if you were charged more than once for the same order, payment succeeded but the purchased access is unavailable, or a purchased file is defective or inaccessible and the issue cannot be resolved. Each request is reviewed against the order, payment and delivery records and applicable consumer law.</p> },
    { title: "Digital access and cancellation", content: <p>After a digital product has been successfully delivered or accessed, cancellation may be limited, subject to applicable law and the facts of the case. This wording does not remove any mandatory consumer rights.</p> },
    { title: "Online consultation bookings", content: <p>1:1 Call Guidance is a separately booked online service, not a PDF download. Consultation cancellation and rescheduling terms have not yet been approved. Cancelling or changing a booking does not automatically authorize a payment refund. Contact support for review; no consultation-specific refund outcome is promised in this draft.</p> },
    { title: "How to contact support", content: <p>Email <a className="underline" href="mailto:help@moneytreeventure.com">help@moneytreeventure.com</a> or use the <Link className="underline" href="/contact#support-form">support form</Link>. Include your order reference, the issue, and relevant non-sensitive details. Never email card numbers, passwords, UPI PINs, one-time passwords or other payment credentials.</p> },
    { title: "Approved refunds", content: <p>If a refund is approved, it may be returned to the original payment method where supported. Processing and crediting time can depend on the payment provider and financial institution. We do not promise a processing time that has not been confirmed.</p> },
    { title: "Statutory rights and review status", content: <p>Nothing here limits a remedy or right that cannot be excluded by law. This policy, including consultation-specific terms, remains a draft pending qualified Indian legal review.</p> },
  ]} />;
}
