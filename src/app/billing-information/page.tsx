import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo/page-metadata";
import Link from "next/link";
import { PublicInfoPage } from "@/components/pages/public-info-page";

export const metadata: Metadata = publicPageMetadata("Billing Information", "How prices, orders and payment status are presented.", "/billing-information");

export default function BillingInformationPage() {
  return <PublicInfoPage eyebrow="Billing" title="Billing Information" intro="See how product prices, discounts and order totals appear in your account." sections={[
    { title: "Prices and totals", content: <p>Published product prices are shown in Indian rupees. At checkout, eligible coupon discounts are applied before the final payable amount is shown. The application does not add a separate tax amount to new checkout totals. Previous orders retain their recorded totals.</p> },
    { title: "Prices, payment and order records", content: <p>Products and supported online services are sold through this website. Prices are displayed in INR. The payable amount is shown in the authenticated order summary. Paid digital access is provided only after payment verification. You can review your orders in <Link className="underline" href="/account/orders">Order History</Link>.</p> },
    { title: "Order records", content: <p>Your account provides an authenticated order summary and payment status. The website does not currently offer a separate invoice download. Contact support with your order reference if you need billing assistance.</p> },
    { title: "Payment confirmations and billing help", content: <p>Payment confirmations may be sent through configured transactional communication channels once those channels are operational; email delivery is not guaranteed and is not the delivery mechanism for protected PDFs. For billing help, contact <a className="underline" href="mailto:help@moneytreeventure.com">help@moneytreeventure.com</a> or use the <Link className="underline" href="/contact#support-form">support form</Link>. Include the order reference, but never send payment credentials.</p> },
    { title: "Online payment availability", content: <p>Online purchases will be available when payment collection is activated. Until then, you may browse products and prices without creating a payable order.</p> },
  ]} />;
}
