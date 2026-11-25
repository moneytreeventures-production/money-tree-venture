import type { Metadata } from "next";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { ContactForm } from "@/components/pages/contact-form";
import Link from "next/link";
export const metadata: Metadata = { title: "Contact Us", description: "Contact Money Tree Venture customer support.", alternates: { canonical: "/contact" } };
export default function ContactPage() {
  return <><Navbar /><main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-secondary">Money Tree Venture</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">Contact Us</h1><p className="mt-3 text-xs text-foreground-secondary">Last updated: 22 November 2026</p>
    <p className="mt-4 max-w-2xl leading-7 text-foreground-secondary">We value our customers and are happy to assist with product questions, payments, digital access, consultation bookings or other concerns.</p>
    <div className="mt-8 grid gap-6 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2 sm:p-7">
      <section><h2 className="font-semibold text-foreground">Customer support</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-foreground-secondary">
        <li>Email: <a className="text-accent-foreground underline" href="mailto:help@moneytreeventure.com">help@moneytreeventure.com</a></li>
        <li>Phone: <a className="text-accent-foreground underline" href="tel:+919820662489">+91 98206 62489</a></li>
        <li><a className="text-accent-foreground underline" href="https://wa.me/919820662489">Contact us on WhatsApp</a></li>
        <li>Address: D-20, Sheetal Sagar Building, Sheetal Nagar, Mira Road East, Thane, Maharashtra 401107, India.</li>
      </ul><p className="mt-3 text-xs leading-5 text-foreground-secondary">If you cannot reach us by email, use the support form below.</p></section>
      <section><h2 className="font-semibold text-foreground">Response target</h2><p className="mt-3 text-sm leading-6 text-foreground-secondary">We aim to respond to general support enquiries within 24–48 business hours. This is a response target, not a promise that every issue will be resolved within that time. Formal consumer grievances remain subject to applicable statutory timelines.</p>
        <p className="mt-3 text-sm leading-6 text-foreground-secondary"><strong className="text-foreground">Grievance contact details are pending.</strong> A grievance officer’s name, designation and direct contact have not been provided, so this information must be completed before legal launch review.</p></section>
    </div>
    <section id="support-form" className="mt-10 scroll-mt-6" aria-labelledby="support-form-heading"><h2 id="support-form-heading" className="text-2xl font-semibold tracking-tight text-foreground">Send a support request</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">Tell us how we can help. Include your order reference when relevant. Never send a password, card number, one-time password or payment PIN.</p><ContactForm /></section>
    <p className="mt-8 text-sm text-foreground-secondary">See our <Link href="/refund-policy" className="text-accent-foreground underline">Refund &amp; Cancellation Policy</Link> and <Link href="/billing-information" className="text-accent-foreground underline">Billing Information</Link>.</p>
  </main><Footer /></>;
}
