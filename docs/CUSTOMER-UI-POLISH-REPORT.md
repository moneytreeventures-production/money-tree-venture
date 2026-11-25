# Customer website copy review — 25 November 2026

## Route inventory and scope

The source scan covered customer-visible App Router pages: `/`, `/products`, `/products/[slug]`, `/cart`, `/checkout`, `/checkout/[orderId]`, `/checkout/return`, `/login`, `/account`, `/account/library`, `/account/orders`, `/account/bookings`, `/about`, `/contact`, `/faqs`, `/resources` (redirect), `/billing-information`, `/privacy-policy`, `/terms`, `/refund-policy`, `/shipping-delivery`, and the root 404 page. Shared navigation, footer, home sections, catalogue, cart, checkout, account, auth and information-page components were included in the customer-string scan. Admin pages and API responses were excluded from this customer-copy pass.

## Findings and edits

- The FAQ described support as awaiting owner confirmation and used internal entitlement wording. It now directs customers to My Library, Bookings and support in plain English while preserving payment and appointment verification conditions.
- The product detail price note said “configured inclusive tax component.” It now directs customers to review the final amount payable at checkout; the billing-details link remains.
- Contact referred to the “existing secure support form” and an independent mailbox verification. It now gives direct, useful contact guidance. The warning against sharing payment credentials remains.
- About called the business name “supplied for this website.” It now uses customer-facing wording while retaining the unresolved registered-entity disclosure.
- Decorative home cards looked like specific published products (“Your First Client,” numbered kits and dated editions). They now use general learning themes; real catalogue cards still come from published products.

The legal, refund, delivery, billing and privacy pages still contain explicit draft/status notices and unresolved policy decisions. Their disclosures were retained because removing them could imply finalized legal or tax terms. These pages need owner, Indian legal and tax review before a public launch. The contact page also still discloses missing grievance-officer details. No legal position or refund promise was invented.

## Presentation and verification

Existing responsive layouts, navigation and form controls were preserved. Visible keyboard focus outlines were added to the two homepage hero links and footer links. This pass did not establish visual quality at every viewport. Application and test TypeScript, focused ESLint, the 8 existing browser component tests, `git diff --check`, and a production build with 55/55 pages generated passed before the final focus-style edit; static checks were repeated afterward. Real authenticated and mobile viewport journeys were not run. No database, payment, email or cloud action occurred.

Changed customer-facing files: `src/components/pages/localized-info-page.tsx`, `src/app/contact/page.tsx`, `src/app/about/page.tsx`, `src/app/products/[slug]/page.tsx`, `src/components/home/hero-section.tsx`, `src/components/layout/footer.tsx`.
