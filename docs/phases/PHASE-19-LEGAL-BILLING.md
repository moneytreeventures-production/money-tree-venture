
## Phase 19 - Legal, billing and delivery page implementation (2026-11-22)

Status: PUBLIC PAGE IMPLEMENTATION COMPLETE; LEGAL/BILLING APPROVAL AND PRODUCTION READINESS BLOCKED.

### Routes and content

- `/about` - owner-supplied About content polished without adding history, statistics, credentials or testimonials; separates PDF products from 1:1 Call Guidance and links to `/products`.
- `/contact` - existing support form retained; adds the supplied customer-service email, phone/WhatsApp, address and non-guaranteed 24-48 business-hour response target. The receiving mailbox is not verified. Grievance officer identity/designation/contact are not configured or owner-supplied and remain a legal launch blocker.
- `/privacy-policy`, `/terms`, `/refund-policy`, `/billing-information`, `/shipping-delivery` - English drafts marked as not effective pending owner/legal approval. Last-updated date: 22 November 2026. Billing Information is a single route; no duplicate billing page was added.
- Footer links all seven requested pages plus product exploration and FAQs. Billing route added to sitemap. Terms are reachable from every page footer before purchase. Product and checkout summaries link to billing details.

Owner-provided public name, tagline, support details and address are used. No registered entity name, CIN, GSTIN, PAN or named grievance officer was invented. The privacy typo `hep@moneytreeventure.com` is corrected to `help@moneytreeventure.com`.

### Verified implementation statements

- Google sign-in uses Better Auth and essential HttpOnly/SameSite=Lax session cookies, Secure in production. No analytics or ad cookies were found in the reviewed application paths.
- Cashfree handles hosted payment processing; application order/payment records carry statuses and provider references. The website is not described as storing full card details or UPI PINs.
- Resend is configured as the transactional email provider, but live delivery remains NOT_VERIFIED; pages do not guarantee email delivery.
- Private PDF access is through an authenticated account and download endpoint backed by Cloudflare R2. No public or transferable PDF URL is described. Call Guidance uses a separate booking workflow.
- Mongo-backed authenticated order history is customer-scoped and displays line items and financial snapshots. It is an order summary only; no receipt or invoice generation capability exists. Receipt generation is BLOCKED, pending approved legal seller identity and tax treatment. No pending or historical order is presented as having received a commercial receipt.

### Billing/GST conflict - production blocker

The owner has declared that Money Tree Venture is not currently GST registered, GST is not charged separately, and GST tax invoices are not issued. The inspected local configuration has `TAX_RATE_BPS=1800`; `priceOrder` calculates and stores a non-zero inclusive tax component after discount, checkout displays "Applicable tax (included)", and immutable order snapshots persist `taxPaise` and `taxSnapshot`. Historical snapshots may also contain non-zero amounts. Production configuration was not accessed. The UI does not label the amount as GST, and this work changed neither tax configuration nor stored order data.

The declaration alone does not establish the correct GST treatment. CBIC material notes registration/invoicing treatment depends on the applicable law and facts, including supply and e-commerce circumstances. Owner and a qualified Indian tax adviser must confirm each offering's classification, registration position, whether any tax applies, and how prices should be presented. Proposed future-only correction: after written approval, select an effective date and configure new orders to the approved treatment (for example, zero tax only if explicitly approved); update checkout labels and snapshot version consistently. Never rewrite historical order snapshots. If another levy applies, identify and present it accurately. No GST invoice or GSTIN is generated.

### Legal and operational launch blockers

- Public-facing trade name is known, but registered legal entity name and legal seller identification are unconfirmed.
- The Consumer Protection (E-Commerce) Rules, 2020 require prominent legal-entity/address/customer-care/grievance details and a named grievance officer; they set complaint acknowledgement and redressal timeframes. No officer name, designation or direct details are configured or supplied. The general support target does not replace that formal grievance process.
- Qualified Indian legal review is required for terms, refund policy, consultation-specific cancellation/rescheduling/refund terms, applicable consumer rights, and the legal seller disclosure.
- DPDP Act/Rules commencement is phased. MeitY's 13 November 2025 commencement notification places specified provisions in force immediately, sections 6(9) and 27(1)(d) after one year (13 November 2026), and a larger set including sections 3-5, 6(1)-(8),(10), 7-17 and others after 18 months (13 May 2027). The 2025 Rules similarly phase Rules 1,2,17-21 immediately, Rule 4 after one year, and Rules 3,5-16,22,23 after 18 months. The privacy draft does not say every duty is already in force. Notice/consent, retention, rights-request handling and the lack of self-service account deletion need counsel/owner review and implementation before applicable deadlines.
- Consultation cancellation/rescheduling terms have not been supplied; no terms are invented and booking cancellation is not represented as an automatic refund.
- Resend live sender/domain verification and delivery remain NOT_VERIFIED. Preserve the Phase 18 security action: rotate `RESEND_API_KEY` and `OUTBOX_WORKER_SECRET` before live sending because prior diagnostic output exposed environment values. No values are recorded here and no rotation was performed.

### Verification

- `node --test tests/legal/legal-pages.test.mjs`: PASS, 6/6 (route definitions, footer, contact links, English/policy claims, authenticated order-summary and tax immutability guardrails).
- Local Next.js 16.4.6 development HTTP smoke: all seven public routes returned 200 with their expected page titles. This is a local rendering check, not a production/browser/device matrix.
- `npm.cmd run test:checkout`: PASS, 30/30, including customer-scoped order detail, multi-line view and integer-paise inclusive tax rules.
- `npm.cmd run test:models`: PASS, 17/17, including immutable order snapshots. These are fixture/model tests, not live database checks.
- TypeScript `npx.cmd tsc --noEmit`: PASS. Focused ESLint: PASS. `git diff --check`: PASS (line-ending notices only).
- No production or development database was modified or used for receipt testing; no Cashfree payment/refund, email, DNS change or deployment occurred. No production build was run.

### Authoritative legal references reviewed

- [MeitY / Gazette - DPDP Act commencement notification, G.S.R. 843(E), 13 November 2025](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
- [MeitY / Gazette - Digital Personal Data Protection Rules, 2025, G.S.R. 846(E)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
- [Department of Consumer Affairs - Consumer Protection (E-Commerce) Rules, 2020](https://consumeraffairs.nic.in/sites/default/files/E%20commerce%20rules_0.pdf)
- [CBIC - GST sectoral FAQs](https://cbic-gst.gov.in/sectoral-faq.html)
- [CBIC - GST invoice rules](https://cbic-gst.gov.in/gst-invoice-rules.html)

Phase 20 has not started. No deployment or publication occurred.
