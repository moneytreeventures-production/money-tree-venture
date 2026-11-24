# Decisions and Open Questions

Audit checkpoint: 2026-11-20. “Confirmed” items below come from the supplied Phase 0 requirements or prior approved project decisions. No code implementation is implied by recording a decision.

## Recovery phase numbering

The current Phase 0-22 recovery tracker is the execution record. Historical implementation labels such as Phase 2.1-2.5 and Phases 4.1-5.2 are preserved as evidence of work already performed; they are not a second active roadmap. Historical project-foundation implementation is baseline input. Current Phase 1 is foundation recovery/build stabilization. Current Phase 2 is the explicit remaining admin identity/access work (verified owner email restriction, `/admin/login`, and account logout). See `docs/PROJECT-TRACKER.md` for current statuses and sequencing.

## Confirmed decisions

| Decision | Reason | Existing architecture impact |
|---|---|---|
| English is the default website language. | Latest Phase 0 brief supersedes the prior Roman-Hinglish default. | Implemented in Phase 8 with an English source dictionary; the static root HTML starts with `lang="en"`. |
| English-only interface | Final owner decision supersedes Phase 8 language options. | Locale infrastructure removed. |
| Only normalized, verified Google identity `moneytreeventuress@gmail.com` may be an administrator. | Explicit sole-admin instruction. | Phase 2 policy now requires the Better Auth verified session, verified matching auth user, exactly one linked Google provider, exact normalized owner email, and active matching admin profile. Real OAuth/database verification is pending. |
| Keep Better Auth and existing Google OAuth. Do not add Auth.js or another provider. | Existing implementation is Better Auth and has tests. | Continue using `/api/auth/[...all]`; admin entry route is a distinct UI route, not a provider callback. |
| `/admin/login` is a requested admin login entry point; OAuth callback remains Better Auth's existing callback. | Keep provider callback configuration intact. | Public route-group page implemented with fixed `/admin` callback and owner access is rechecked server-side. Live OAuth is unverified. |
| Customer and admin surfaces must have a visible working logout control. | Owner requirement. | Shared Better Auth sign-out control is present on `/account`, the admin header, and restricted admin access; real session invalidation is unverified without a test session. |
| The external `seed-data.ts` specification is not in this repository and is not an implementation. | Owner says the specification is supplied separately and must not be fabricated. | No product/category seed script is present. Phase 6 waits for owner-provided complete data. |
| Product seed work is assigned to Phase 6. | Explicit owner instruction. | Use only a disposable development/test database, idempotent stable keys, and existing validators/lifecycle rules. |
| Thumbnails and promotional video are optional. | Missing media should not break a listing/detail. | `imageRefs` and `promotionalVideoUrl` are optional; fallbacks and no-autoplay behavior are tested. |
| Product catalogue is database-backed, not hardcoded as product records on the homepage. | Preserve the current catalogue architecture and avoid invented content. | Public API/service query published product records. No records were seeded in this audit. |
| Initial paid media is PDFs only, plus one separate Call Guidance booking product. | Existing approved product scope. | `video` formats cannot be converted to paid downloadable products. Promotional video is a separate preview field only. |
| Do not access/modify production data, deploy, publish, or make DNS changes during Phase 0. | Audit-only scope. | No such action was performed. |

## External seed field mapping

- Title -> `name`; slug -> `slug`; category -> `categoryIds` references; short/full descriptions -> `shortDescription` / `description`.
- Price/original price -> integer `pricePaise` / `compareAtPricePaise` (convert INR rupees to paise; never copy decimal rupees directly).
- `pdf` -> `productType: "pdf"`; requires a valid active private PDF asset to publish.
- `bundle` -> `productType: "pdf_bundle"` plus `bundleKind: "bundle"`; Starter Kit uses `bundleKind: "starter_kit"`. Included records must be eligible individual PDFs.
- `consultation` -> `productType: "call_guidance"`; separate booking fulfilment, no PDF asset.
- `video` and `video_and_files` -> unsupported as paid product types in the approved initial scope. Do not reinterpret them as PDFs or promise course access.
- Optional thumbnail -> `imageRefs`; optional promo preview -> HTTPS `promotionalVideoUrl`. Promotional media does not grant purchase access and is not stored as a private PDF asset.
- Features, benefits, included content, and FAQs have corresponding fields: `features`, `benefits`, `includedContent`, `faqs`.
- No dedicated fields were found for `formatDetails`, `audience`, `leaf number`, `tags`, or `target customers`. Do not silently merge them into unrelated descriptions; owner must approve whether to omit or request a minimal schema extension.

## Unresolved owner decisions

1. Review Phase 6's source-only field omissions and replace or approve the paid-video-oriented draft copy before any seed apply.
2. Owner must sign in with the approved Google account, verify the auth user/provider/profile records, and run the admin bootstrap only after confirming the configured database is disposable non-production. No role was changed by this phase.
3. Review final English copy and owner-approved business/legal content.
4. Finalize registered business identity, support contact, privacy/terms/refund/delivery wording, tax settings, and compliance review.
5. Approve a staging CSP strategy and product-detail sitemap generation approach.

## Phase 6 decisions — 2026-11-21

| Decision | Rationale | Implementation / status |
|---|---|---|
| Initial sellable catalogue is limited to individual PDFs, PDF-only bundles, and separate 1:1 Call Guidance. Paid videos, video courses, ZIPs, audio, and other digital media are out of scope. | Owner clarification for the actual catalogue. | Existing formats `video`, `video_and_files`, and current bundle promises containing videos are blocked by seed mapping. Optional promotional-video references remain preview media only, not purchased content. |
| Use the repository's `scripts/seed/source-products.ts` as draft source, but do not auto-publish it. | Source has not been approved as final commercial copy and references deliverables that may not exist. | No product writes occurred. Two entries are map-compatible as drafts; eight are blocked pending PDF-only copy/contents. |
| Do not add fields only to absorb unmapped seed metadata. | Existing product schema has no direct semantic fields for audience, tags, who-should-buy or format details; unrelated fields would misrepresent them. | Source fields remain intact in the fixture and are named in dry-run output. Apply requires explicit acknowledgement; owner should decide whether to omit or later approve a schema change. |
| Admin navigation may display Admin Panel only after the current server-side owner authorization decision succeeds. | A browser role/email is not an authorization source. | Navbar queries a no-store same-origin route that reuses `getCurrentAdmin()`. Existing route/API authorization is unchanged. |

| Admin media uploads use private staging plus a separate public media bucket and credentials; private PDFs remain in the original private bucket. | Promotional thumbnails/videos are public catalogue media; uploaded originals must be validated before public delivery and must not share PDF storage. | Product media config rejects bucket overlap, server verifies object metadata/content before publishing, and signed PUT URLs target staging only. Cloudflare buckets, keys, CORS and delivery domain remain owner-configured and unverified. |
| Next.js admin navigation authorization remains in the existing protected layout; uncached dashboard counts sit behind page Suspense. | Do not weaken authorization to suppress the Next.js blocking-navigation warning. | Structural change is implemented; authenticated local development navigation is still required to confirm the warning is gone. |


## English-only owner decision ? 2026-11-21

MoneyTreeVentures is an English-only website. Multilingual interface support and planned translation API integrations have been cancelled.

This decision supersedes previous multilingual requirements and expansion plans. Historical Phase 8 records are retained. Phase 9 requires a separate owner instruction. Verification and production configuration limitations are recorded in docs/TEST-REGISTER.md.


## Phase 10 review policy ? 2026-11-21

One review per customer per product is enforced by a unique index. Active entitlement and an order with paid order/payment states are required at submission. New reviews enter moderation. Only approved reviews affect public ratings. Moderation updates and audit events share a Mongo transaction. Refunds/revocations block new reviews; treatment of previously approved reviews after a later refund requires owner policy review.


## Phase 11 support policy ? 2026-11-21

Support requests use private references and are retained without automatic deletion until the owner approves a retention schedule. Five submissions per email per hour are allowed through an indexed MongoDB counter. Grievances share the support status workflow. Email notifications await a confirmed support recipient and sender configuration. No response deadline or grievance officer is published.


## Initial personal-use digital product policy ? 2026-11-22

One personal-use entitlement per distinct PDF product per customer. Duplicate PDF quantity is not supported. Already-owned PDFs should be accessed through My Library rather than charged again. Multi-product orders grant access to each distinct entitled resource.

## Approved PDF repurchase policy - 2026-11-22

This decision supersedes the prior one-purchase-per-product restriction for PDFs and PDF bundles. My Library remains the default free way to download an existing purchase. An authenticated customer may deliberately purchase an already-owned PDF again after seeing its current price, the available free access, and an affirmative Purchase Again confirmation. Mixed carts require acknowledgment of each owned PDF. A single order still rejects duplicate product IDs and quantity above one. Call Guidance repeat purchase policy is unchanged. Each paid order keeps a distinct purchase record and confirmation; refunding one order must leave access granted by another non-refunded order. Active checkout claims protect unresolved payments and become completed only after verified paid fulfillment. The purchase-history index migration is a separate guarded non-production operator step; no production index or order data was changed here.
