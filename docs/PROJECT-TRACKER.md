# Project Tracker

Recovery checkpoint: 2026-11-21. Statuses below describe evidence in this workspace, not production state. This Phase 0-22 tracker is the authoritative recovery and verification sequence. Historical implementation milestones (including original Phases 2.1-5.2) remain preserved as evidence and are not a competing execution sequence. Historical foundation work is baseline input; current Phase 1 covers build/environment/Git recovery, and current Phase 2 is the admin identity and authorization remediation required by the owner. Phase 7-22 task details remain provisional where noted and require owner confirmation before those phases begin.

Allowed statuses: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `PARTIALLY_VERIFIED`, `COMPLETED`.

| Phase | Objective | Status | Evidence / dependencies | Blocker / next action |
|---|---|---|---|---|
| 0 | Audit repository, configuration, security, routes, product schema, tests, and current blockers; establish evidence-based records. | `PARTIALLY_VERIFIED` | [Phase 0 audit](phases/PHASE-00-AUDIT.md); full local suite and environment schema check. | Source audit is documented; external DB/provider behavior is not verified. |
| 1 | Foundation recovery: remove external Google Font build dependency, stabilize local build/environment checks and Git ignore rules. | `COMPLETED` | [Phase 1 report](phases/PHASE-01-FOUNDATION.md); production build, smoke, env validation, lint, TypeScript, and tests passed locally. | No production or external provider verification was performed. |
| 2 | Google identity, verified owner-only admin authorization, Admin Login entry, and customer/admin logout. | `PARTIALLY_VERIFIED` | [Phase 2 report](phases/PHASE-02-AUTHENTICATION.md), [Phase 2.1 verification](phases/PHASE-02-1-VERIFICATION.md), [Phase 2.3 admin-access blocker](phases/PHASE-02-3-ADMIN-ACCESS.md); local authorization/bootstrap tests pass. | Owner reports that role provisioning was corrected and admin access now works. This session could not verify the authenticated owner dashboard; fresh standalone Atlas SRV lookup remains blocked by DNS timeout. No bootstrap or role change was performed here. |
| 3 | Stabilize runtime warnings and admin workspace, then verify catalogue/commerce integration against existing implementation. | `PARTIALLY_VERIFIED` | [Phase 3 runtime/admin report](phases/PHASE-03-RUNTIME-ADMIN.md), including Phase 3.1 product-list hardening; 65 catalogue tests, focused Chromium component rendering, TypeScript, ESLint, and production build passed. | The undefined name was handled as an incomplete API record at the UI boundary; no DB record was inspected or migrated. Authenticated `/admin/products` route and disposable-DB CRUD remain unverified. Two sanitized build-time `admin.api.request_failed` events remain unexplained. |
| 4 | Catalogue, product lifecycle, cart, orders, coupons, Cashfree, PDF fulfilment, bookings, customer account, and outbox. | `PARTIALLY_VERIFIED` | Phase 4.1-4.6 services/routes and local tests. | No end-to-end UI run against a disposable database or provider sandboxes. Homepage `FeaturedProducts` still uses hardcoded illustrative cards, not the approved DB catalogue. |
| 5 | Public website, SEO, accessibility, integration QA, and launch readiness. | `PARTIALLY_VERIFIED` | Historical Phase 5.1 routes/navigation, local responsive checks, and current Phase 1 build/smoke evidence; see [launch readiness](LAUNCH-READINESS.md). | Dynamic product sitemap, staging integrations, CSP review, legal copy, and end-to-end journeys remain outstanding. |
| 6 | Import the owner's ten source products and four categories using a safe, idempotent non-production seed process. | `PARTIALLY_VERIFIED` | [Phase 6 report](phases/PHASE-06-PRODUCT-SEEDING.md); `scripts/seed/source-products.ts` is present; dry-run recognizes 4 categories/10 products, maps 2 to drafts and blocks 8 incompatible paid-video formats. | No DB was queried or written. Owner must approve corrected PDF-only copy, source-only field disposition and a disposable non-production DB before apply. |
| 7 | Admin category multi-selection and database-backed public catalogue search, filters, sorting, pagination, and detail review. | `PARTIALLY_VERIFIED` | [Phase 7 report](phases/PHASE-07-CATALOGUE-SEARCH.md); category/query/service/model tests, Chromium component fixtures, TypeScript, ESLint, isolated build and smoke passed. | Owner-authenticated persistence, DB index application/search, and route-level responsive/theme checks remain unverified. |
| 8 | Customer review submission and admin approve/reject moderation. | `NOT_STARTED` | Provisional assignment; no review route/model found. | Depends on Phase 7 and abuse/rate-limit decisions. |
| 9 | Secure contact form with validation, spam/rate limiting, storage, and admin review. | `NOT_STARTED` | `/contact` currently contains owner-review copy only. | Confirm support routing, retention, and admin workflow. |
| 10 | English-only interface | IMPLEMENTED | Fixed English UI and en-IN currency utility. | Final verification recorded in TEST-REGISTER.md. |
| 11 | Branded custom 404 and correct 404 behavior for unknown routes and invalid/missing products. | `NOT_STARTED` | No `not-found.tsx`; unknown-route default response is 404. Invalid product slug returned a 404 body with HTTP 200 in the running local dev server. | Build custom not-found UI and verify status in production mode after build is fixed. |
| 12 | Finalize policy/compliance text, business identity, contact/support details, tax wording, and provider requirements. | `BLOCKED` | Legal routes exist as drafts. | Owner review and applicable professional review required; no identity or promises may be invented. |
| 13 | Complete SEO metadata, canonical coverage, robots rules, and dynamic published-product sitemap entries. | `PARTIALLY_VERIFIED` | Static sitemap/robots and route metadata exist. | Sitemap currently omits individual published product slugs; production smoke is blocked. |
| 14 | Finalize genuine product media and ensure optional thumbnail/video fallbacks remain safe. | `PARTIALLY_VERIFIED` | Optional `imageRefs`/HTTPS `promotionalVideoUrl`; media browser test passes. | Real owner-approved media is not supplied; no video purchasing/delivery capability is planned. |
| 15 | Verify personalized PDF fulfilment end to end, including ownership, revisions, watermark, and download controls. | `PARTIALLY_VERIFIED` | Local fulfillment and entitlement tests pass. | R2, database transaction, watermark scripts, and signed URL expiry require non-production integration checks. |
| 16 | Verify booking lifecycle, customer privacy, audited admin operations, and transactional notifications. | `PARTIALLY_VERIFIED` | Booking/outbox tests pass; Netlify scheduled handler tested with mocks. | Resend delivery and actual scheduled execution remain pending. |
| 17 | Security hardening: single-email admin enforcement, secret scanning, CSP evaluation, headers, privacy, and abuse controls. | `PARTIALLY_VERIFIED` | Server-side role gates, request limits, raw-body Cashfree verification, R2 ownership, and security headers exist. | Email allowlist and CSP absent; fresh client-bundle scan blocked; `debug.log` is untracked and not ignored. |
| 18 | Complete performance, accessibility, keyboard, reduced-motion, responsive, and SEO quality review. | `PARTIALLY_VERIFIED` | Shared navigation tested at 390/768/1440 and existing media browser test passes. | Full route/device/browser matrix and production performance data are not available. |
| 19 | Run full integration scenarios using disposable Mongo replica set and provider sandboxes. | `BLOCKED` | Mocked unit/provider tests pass. | Configure dedicated non-production Mongo, Cashfree, R2, and Resend sandbox resources. |
| 20 | Configure isolated staging, deployment recovery, backups, monitoring, and security validation. | `BLOCKED` | Deployment documentation exists. | Client-owned Netlify/Atlas/R2/provider staging configuration and access are not verified. |
| 21 | Production deployment, domain/HTTPS, provider onboarding, and approved launch transaction. | `BLOCKED` | Runbooks exist; no deployment or DNS changes made. | Requires owner approval, completed legal/configuration work, successful staging, and paid-provider readiness. |
| 22 | Post-launch monitoring, incident response, catalog operations, backups, and continuous regression checks. | `NOT_STARTED` | Provisional final phase. | Define owners, service-level expectations, backup/recovery cadence, and operational costs before launch. |

## Current recommendation

Phase 2 implementation is present and remains partially verified because the real authenticated admin session and logout were not independently observed in this workspace. The owner reports role correction and successful access. No further role provisioning is proposed. Phase 3 runtime/admin changes are recorded in [the Phase 3 report](phases/PHASE-03-RUNTIME-ADMIN.md); end-to-end admin UI checks against a disposable database remain outstanding. Preserve earlier reports as historical evidence.

### Phase 4 admin warning and media upload checkpoint — 2026-11-21

See [Phase 4 media report](phases/PHASE-04-MEDIA-UPLOAD.md). The protected layout remains the sole admin gate; dashboard database counts are isolated behind page-level Suspense. Product media uploads use private staging and a separate public media bucket, never the private PDF bucket. Local implementation is in progress verification; authenticated browser and non-production R2 checks are pending.

## Phase 5 product CRUD checkpoint — 2026-11-21

See [Phase 5 product CRUD report](phases/PHASE-05-PRODUCT-CRUD.md). Existing product, category, lifecycle, asset, media, API and authorization services were reused. Local component coverage now checks listing metadata/loading/empty/error-safe cases, optional-thumbnail publication controls, and malformed rows. Product editing preserves inactive category assignments and can clear compare-at pricing. The Phase 0–22 roadmap rows remain intact; this Phase 5 assignment checkpoint is separate from roadmap Phase 5 website work.

End-to-end status remains `PARTIALLY_VERIFIED`: no authenticated admin browser or disposable database operations were used. Plain build is blocked by the local `.env.local` `r2.dev` public-media URL; a production build and smoke pass with a temporary reserved HTTPS host and dummy localhost DB. The build continues to log two sanitized dashboard-count failures against that dummy DB.

## Phase 6 product seed and navigation checkpoint — 2026-11-21

See [Phase 6 report](phases/PHASE-06-PRODUCT-SEEDING.md). The admin Manage Products CTA now has explicit orange/navy emphasis and visible hover/focus styling. Navbar Account becomes Admin Panel only after the same-origin server check approves the active, verified owner admin; the mobile link uses the same decision. Existing route/API gates are unchanged. The supplied source fixture is present; product scope is PDFs/PDF bundles plus separate Call Guidance, so 8 paid-video/video-and-files/bundle records are blocked and only one PDF and one call can be represented as drafts. Seed dry-run and focused unit/browser tests passed. No database was connected, no product/category was created, no authenticated owner route was independently verified, and no record was published. The owner reports prior manual product creation; this is not Codex browser verification.

## Phase 7 catalogue checkpoint — 2026-11-21

See [Phase 7 report](phases/PHASE-07-CATALOGUE-SEARCH.md). The editor now provides checkbox-based multi-category selection and explicit category API states; the model/API already supported category ID arrays. Public product search, category/INR-price/type filters, sorting, bounded pagination, and URL state use the database-backed published catalogue service. Local category/catalogue/model tests, component fixtures, TypeScript, ESLint, isolated build and production smoke passed. No database/index apply, owner-session save/reload, responsive route matrix, seed apply, R2 access, or provider sandbox was performed. This is a local implementation checkpoint, not launch readiness.

## Phase 8 multilingual checkpoint — 2026-11-21

See [Phase 8 report](phases/PHASE-08-MULTILINGUAL.md). English is the default; an allowlisted locale cookie selects Hindi, Hinglish, or Tamil without changing URLs or authentication/cart/payment state. Core UI is localized with English fallback, locale-aware INR formatting, and source-language notices for product-authored and legal copy. Phase 8 tests and build results are recorded in the phase report. Full route/device/theme browser validation and translation review remain pending. Phase 9 has not started; the project is not launch-ready.


## English-only owner decision ? 2026-11-21

MoneyTreeVentures is an English-only website. Multilingual interface support and planned translation API integrations have been cancelled.

This decision supersedes previous multilingual requirements and expansion plans. Historical Phase 8 records are retained. Phase 9 requires a separate owner instruction. Verification and production configuration limitations are recorded in docs/TEST-REGISTER.md.


## Phase 9 checkpoint - 2026-11-21

Dynamic database-backed homepage and branded 404 implemented. TypeScript, ESLint, catalogue/admin tests, four browser component fixtures, one homepage rendering fixture, isolated build and production smoke passed. Unknown route returned 404; malformed product slug streamed 200 with branded UI and noindex. Real database journeys and the responsive/theme route matrix remain NOT_RUN. Existing production media configuration blocks an ordinary build. See [Phase 9 report](phases/PHASE-09-HOMEPAGE-404.md) for commands, files and limitations. The current owner assignment names Phase 10 reviews and moderation as next; earlier roadmap rows are historical provisional assignments.


## Phase 10 checkpoint ? 2026-11-21

Verified-purchaser review submission, owner moderation, approved-only ratings and homepage review strip implemented. TypeScript, ESLint, targeted tests, Chromium fixtures and isolated build/smoke passed. Real database, transaction, purchase and authenticated browser journeys remain NOT_RUN. Ordinary build remains blocked by r2.dev media URL validation. See [Phase 10 report](phases/PHASE-10-REVIEWS-MODERATION.md).


## Phase 11 checkpoint ? 2026-11-21

Contact form and private support inbox implemented, including grievance classification, rate counter and audited status updates. TypeScript, ESLint, support schema test, admin authorization tests, Chromium fixtures and isolated build/smoke passed. Actual database-backed submission and owner browser verification remain NOT_RUN. Ordinary build remains blocked by r2.dev media URL validation. See [Phase 11 report](phases/PHASE-11-CONTACT-SUPPORT.md).


## Phase 12 checkpoint ? 2026-11-21

The final correction uses server-resolved published product prices for coupon previews, shares product/category restrictions with checkout, and revalidates the quote when cart or product-price signatures change. Previous results: checkout 18/18, catalogue 78/78, Chromium 4/4 (without coupons), TypeScript/ESLint, isolated build and smoke passed; isolated build logged two sanitized unavailable-DB errors. Correction results: checkout/cart/coupon 22/22, focused Chromium 5/5, TypeScript/ESLint and isolated build passed; focused production endpoint smoke passed cross-origin rejection, while the broader smoke script timed out. Live MongoDB/Cashfree remain NOT_VERIFIED. Ordinary build remains blocked by existing r2.dev URL validation. See [Phase 12 report](phases/PHASE-12-CART-COUPONS.md).

## Owner-assigned Phase 13 checkout/order checkpoint - 2026-11-21

Existing authenticated checkout, order snapshots, coupon reservation/redemption, Cashfree and fulfillment architecture were hardened in place. See [Phase 13 report](phases/PHASE-13-CHECKOUT-ORDERS.md). Focused checkout/provider/model/auth tests, six browser component fixtures, TypeScript, ESLint and an isolated build passed. Full production smoke timed out. Real MongoDB transaction/concurrency behavior, Cashfree sandbox/callbacks, and authenticated browser journeys remain NOT_VERIFIED. Phase 14 is the next owner-assigned work for those integrations. The legacy Phase 0-22 roadmap rows, including SEO/sitemap requirement R-021, remain intact; this checkpoint does not replace that requirement or mark it complete.

## Phase 14 Cashfree reconciliation checkpoint — 2026-11-22

Two existing sandbox orders were read using Cashfree GET APIs and both returned PAID with a matching SUCCESS payment and INR amount. In the confirmed development database, both local records were pending; the app reconciler moved them to paid/success. This identified and fixed hydrated-document lifecycle saves that raised Mongoose StrictModeError on immutable financial paths. A second order for an already-owned product then identified an active-purchase uniqueness collision; fulfillment now reuses the existing active entitlement with an audit record. A signed synthetic success/duplicate/out-of-order webhook exercise against development Mongo confirmed idempotency and no paid-state downgrade. No payment create, refund, deployment, or production write occurred. Focused verification is recorded in [Phase 14 report](phases/PHASE-14-CASHFREE-PAYMENTS-REFUNDS.md). Public HTTPS webhook delivery/configuration, real authenticated customer browser verification, and refund operation remain NOT_VERIFIED; Phase 15 has not started.


## Phase 14 abandoned-order follow-up ? 2026-11-22

Implemented customer-scoped history filtering for finalized expired unpaid/failed orders without paidAt. Paid, refunded, and pending orders stay visible; the service reads Mongo directly without a shared cache. Existing expiration now conservatively refuses every payment-bearing order. Maintenance reconciles attempted payments through the existing Cashfree service and preserves them, including provider errors; it never fabricates failure. No-attempt expired orders use the existing transaction, conditional status update, coupon release and audit event.

Added `src/lib/checkout/order-maintenance.ts`, a bounded, dry-run-by-default maintenance service. Purge accepts only sandbox, terminal expired unpaid/failed orders beyond retention, with an expiration audit older than retention and no payment, coupon-redemption, refund, purchase, booking, webhook or outbox dependency. Existing audits remain as tombstones and deletion adds a sanitized audit in the same transaction. Conditional deletion rechecks state and updatedAt; transaction conflicts preserve the order. Production deletion is hard-disabled. Every payment-bearing or coupon-bearing order is conservatively retained, even after confirmed failure/release. This is intentionally narrower than the eventual cleanup policy.

Proposed development retention is 30 days, configurable with ORDER_RETENTION_DAYS. It is not an approved production compliance policy. `npm.cmd run orders:maintain -- --confirm-database moneytreeventures --confirm-non-production` previews expiration without provider calls or writes. Add `--purge` for retention dry-run. Only an explicit `--apply` allows mutation. Do not run purge apply against genuine historical records before disposable-database integration passes. No database maintenance command, purge or dry-run was executed in this follow-up; no actual documents were deleted.

Netlify `expire-orders` calls the authenticated internal maintenance route every 15 minutes, gated by ORDER_EXPIRATION_ENABLED=true, ORDER_MAINTENANCE_DATABASE, APP_URL and existing OUTBOX_WORKER_SECRET. No deployment or activation occurred. Local automation can invoke the CLI through Windows Task Scheduler, with working directory D:\MoneyTreeVenture; schedule expiration separately from the purge command. No destructive production schedule is configured. Approve production retention/legal rules before adding a production deletion path.

Verification: checkout tests 29/29; focused retention policy/payment API/webhook tests 22/22 passed. Retention tests protect paid, pending, refunded, partially-refunded, recent and unfinalized states. These are fixtures, not transaction/persistence proof. Remaining required coverage: disposable Mongo tests for deletion, dependency preservation, coupon release, repeated execution and concurrent reconciliation; worker HTTP authentication integration and history refresh browser check. Payment-bearing failed attempts remain retained pending explicit provider-terminal eligibility design. Bounded oldest-first batches may require operator handling when preserved candidates fill the batch; durable pagination is still needed before unattended backlog processing is claimed complete. The two paid sandbox orders cannot meet purge status criteria and were not accessed or changed. This follow-up is PARTIALLY IMPLEMENTED / NOT LIVE VERIFIED. Phase 15 has not started.


## Phase 14 final cleanup correction ? 2026-11-22

Expiration maintenance now reconciles all recorded payment attempts through Cashfree before trying to expire an order. The existing transactional expiration service permits finalization only when no attempt is pending/successful or has an unverified provider status; terminal FAILED, USER_DROPPED and NOT_ATTEMPTED are the accepted provider outcomes. Purchase and refund dependencies also block expiration. Provider errors preserve the order and increment the maintenance failure count. The existing coupon-release and audit transaction remains in use. Late provider success can still reconcile through the payment service; paid orders are never selected for expiration.

Both maintenance modes now use a stable `_id` keyset and a persisted cursor in `orderMaintenanceCursors`. Each invocation scans at most the configured batch limit, advances past preserved or failed candidates, and resets at the end for the next sweep. Conditional cursor updates avoid silent regression across competing runs; order deletion itself remains conditional and transactional. Dry-run does not change the cursor. The existing Netlify schedule remains gated and only invokes expiration; purge has no automatic schedule and production purge stays disabled.

Added a disposable MongoDB integration test using `MONGODB_TEST_URI` and a randomly named test database. It covers dry-run, protected paid order, old eligible orders, bounded continuation, deletion, retained audit and repeat execution. The variable was absent, so this real MongoDB test was SKIPPED/NOT_RUN. The test does not cover every requested case, notably provider outage, coupon release, transaction rollback or simultaneous jobs. No maintenance operation or real database mutation was executed this turn. A separate replica set test database is required to complete integration verification; do not target `moneytreeventures` for destructive fixtures.

Focused test command: 21 PASS, 1 SKIPPED (disposable Mongo); TypeScript, CLI compilation, focused ESLint and git diff --check PASS. Existing line-ending notices only. Customer history filter remains unchanged. Phase 15 has not started; production retention approval and real signed webhook/browser checks remain outstanding.


## Phase 15 partial implementation ? 2026-11-22

See docs/phases/PHASE-15-SECURE-PDF-DELIVERY.md. Added verified-payment/source-snapshot checks to PDF generation/download, removed email from new watermarks, bounded processing and added private/no-store headers. Focused fixture/PDF tests 24/24 and TypeScript passed. Real R2, Mongo entitlement integration, browser and build were NOT_RUN. Authenticated delivery without signed-object-path exposure, matching listing/UI checks, full security/layout tests and cache migration policy remain unfinished. No database or storage records changed. Phase 15 is NOT COMPLETE; Phase 16 has not started.


## Phase 15 authenticated delivery completion checkpoint ? 2026-11-22

Customer download GET now authenticates on every request and returns PDF bytes from the application with attachment, nosniff, private/no-store and no-referrer headers. It no longer returns a transferable signed R2 URL. The service verifies active owned purchase, paid order, stored successful Cashfree payment evidence, snapshotted product/asset/version and purchaser-specific private object prefix; it rechecks access after cache generation. The browser downloads the response as a temporary local Blob URL and handles expired sessions and errors. The purchase list now requires matching stored verified-payment evidence, and the button retries failed generated copies.

Current watermark format is version 2 (name and order reference, no email). New copies record `watermarkVersion=2`; ready records with missing/old version are marked failed and regenerated lazily from the private master on the next authorized request. Existing derived keys may be overwritten by regenerated private copies; masters are never overwritten. Output size and checksum are verified before response. Old cached copies are not served as current. The server still buffers bounded PDF bytes, so live Netlify memory/response limits must be checked.

Focused synthetic route/PDF/entitlement/payment tests passed (25/25 in the first combined run, then 15/15 after the final UI/test edit); TypeScript, focused ESLint and git diff --check passed. No real R2 request, authenticated customer browser session, rendered visual PDF inspection or isolated production build was performed. Existing development entitlement/master state was not accessed. No database or R2 object was changed in this turn; lazy regeneration will write a private derived object when an eligible customer next downloads an old copy. Additional service-level Mongo/R2 integration and concurrent regeneration checks remain pending. Phase 16 has not started.


## Phase 16 partial checkpoint ? 2026-11-22

See docs/phases/PHASE-16-ACCOUNT-LIBRARY.md. Bounded account-time expiration for no-attempt overdue orders, one-license quantity enforcement, checkout active-entitlement rejection, account navigation and order links implemented. Existing multi-line paid fulfillment reused. Focused tests 29/29 and TypeScript passed; no live MongoDB/browser/build check. Concurrent pre-payment checkouts, richer library, product-level Already Purchased and backlog maintenance activation remain open. Phase 17 not started.


## Phase 16 concurrent purchase follow-up ? 2026-11-22

Added `checkoutClaims` with a unique partial index on `(userId, productId)` while status is active. Each new checkout creates claims for every distinct product in the same Mongo transaction as the order. A competing overlapping cart gets an actionable conflict before payment initiation. Checkout checks index presence and fails closed until the guarded `db:indexes` migration creates it. The existing idempotency retry returns the original order. Legacy open orders without claims also block a new checkout for overlapping products. Confirmed unpaid expiration releases claims in its transaction; verified full refund releases them after entitlement revocation. Pending/unresolved payments retain claims. Paid claims remain active to align with the one-license entitlement policy. A late success after release uses existing duplicate-entitlement audit behavior; financial records remain intact and require manual exception review.

Index prerequisite: review the confirmed non-production target, then run `npm.cmd run db:indexes -- --confirm-database moneytreeventures` from PowerShell. This command was NOT executed; no development records or indexes were changed. Existing `autoIndex: false` makes the prerequisite mandatory. Concurrent transaction/unique-index behavior is NOT VERIFIED without `MONGODB_TEST_URI` and a disposable replica-set database. The local suite cannot prove race safety; create a disposable test using two sessions and verify only one Cashfree initiation becomes possible before deployment.

The product purchase action now reads customer-scoped `/api/purchases` and shows Already Purchased with My Library link for an active verified entitlement. It still shows Already in Cart for local cart state. The account library exposes product/order links and shows 12 items at a time with Show more; the server currently loads at most 100, so full server pagination and totals beyond 100 remain open. Existing order detail and bounded expiration remain as Phase 16's prior checkpoint. No real multiple-PDF fulfillment, expired-history, signed-in browser or R2 check was run.

Focused model tests 17/17 and checkout tests 29/29 PASS; TypeScript, focused ESLint and git diff --check PASS. No production build or real MongoDB test. Phase 16 is PARTIALLY VERIFIED and requires the index migration, disposable concurrency test and authenticated browser checks before calling it complete. Phase 17 has not started.


## Phase 17 booking checkpoint ? 2026-11-22

See docs/phases/PHASE-17-CONSULTATION-BOOKINGS.md. Existing Call Guidance booking flow now checks verified payment evidence for customer requests/admin transitions and distinguishes scheduled from confirmed. Owner schedule writes serialize on a Mongo lock and check interval overlap. Booking/purchase tests 17/17, TypeScript, focused ESLint and diff check PASS. Real database concurrency, authenticated browser and live consultation purchase NOT_VERIFIED. Owner availability and cancellation/refund policy decisions remain open. Phase 17 PARTIAL; Phase 18 not started.

## Phase 19 tracker checkpoint - 2026-11-22

Implemented the seven public routes (`/about`, `/contact`, `/privacy-policy`, `/terms`, `/refund-policy`, `/billing-information`, `/shipping-delivery`), consolidated billing into one page, updated footer/sitemap and exposed customer order summaries as summaries rather than receipts. Legal pages remain drafts pending owner and qualified Indian legal approval.

Phase status: PARTIAL / LAUNCH BLOCKED. Confirmed blockers: legal seller entity name and grievance officer details are missing; GST non-registration declaration conflicts with the inspected local `TAX_RATE_BPS=1800` inclusive-tax calculation and stored tax snapshots; no compliant commercial receipt implementation is available; privacy consent/retention/request and account-deletion practices need review; consultation cancellation/rescheduling terms are unapproved; Resend live status is unverified and its key plus worker secret must be rotated before sending. Historical financial snapshots were not changed. See `docs/phases/PHASE-19-LEGAL-BILLING.md`. Phase 20 not started.

## Account UI and history upgrade - 2026-11-22

Implemented separate overview, PDF library, order history and consultation pages; authenticated customer-only access; exact order status filters and server pagination; reversible per-customer archive; repeat PDF library cards with verified-payment pagination beyond 100 products. Permanent order purge is disabled until retention policy is approved. Real authenticated browser and database pagination/archiving remain NOT_VERIFIED. Purchase-index migration remains pending; Phase 20 has not begun.

## Phase 20 checkpoint — 2026-11-23

PARTIAL. Added same-origin checks for customer order/ownership/archive mutations, payment initiation and shared admin API mutations. Checkout tests 41/41, TypeScript, focused ESLint and diff check PASS. Broad security review, performance baseline, browser checks, dependency audit and production build remain open. See docs/phases/PHASE-20-SECURITY-PERFORMANCE.md.

Phase 21A checkpoint (24 November 2026): PARTIAL. Added tests/e2e/local-journey.test.mjs using existing Chromium/node:test, isolated anonymous profile and localhost-only target; no dependencies installed. Actual browser run BLOCKED at CDP Page.enable (15-second timeout), before app navigation. No E2E journey passed. Supporting deterministic/MOCKED tests: 26 PASS; disposable Mongo claim tests: 2 NOT_RUN (MONGODB_TEST_URI absent). TypeScript, focused ESLint and diff check PASS. Owner manual viewport result 6/6 is preserved; Web Vitals NOT_MEASURED. Authenticated customer/admin journeys MANUAL_REQUIRED; full interaction automation remains unfinished. See docs/phases/PHASE-21-END-TO-END-QA.md for exact PowerShell commands and remaining checklist. All production media, R2 isolation, webhook, email rotation/delivery, scheduler, Mongo, GST/legal, consultation and Atlas gates remain open. No deployment, payments, refunds or emails.

## Phase 21 final QA handoff - 24 November 2026

Status: source and focused regression handoff COMPLETE; real signed-in customer QA BLOCKED/MANUAL_REQUIRED. Owner reports normal-Chrome Cashfree sandbox checkout now opens, anonymous Chromium E2E 10/10 twice on Windows, and 390/768/1440 light/dark viewport checks. This does not establish PAID status, fulfillment or real PDF delivery. Agent E2E again failed before navigation at CDP Page.enable. Corrected stale test expectations and hosted-checkout useRef fixture only; no application source change in this closeout. Focused regressions 284 PASS, 4 SKIP (disposable MongoDB URI absent); application/test TypeScript, admin CLI compile, focused ESLint and diff check PASS. The historical expired order's final state could not be read due DNS SRV ETIMEOUT, so it remains unresolved in this handoff. See Phase 21 report for the 22-scenario evidence table, owner normal-Chrome checklist and Phase 22 staging-entry matrix. Phase 22 has not started; staging/public launch are not approved.

## Phase 22A staging preparation - 24 November 2026

Prepared docs/phases/PHASE-22-STAGING-LAUNCH.md with repository-specific R2 isolation, HTTPS environment matrix, Netlify/Node/OpenNext setup, staging data/payment separation, ordered staging checks and dashboard owner actions. Local name-only check: three R2 buckets present and pairwise distinct; APP_URL/BETTER_AUTH_URL/CASHFREE_RETURN_URL_BASE are localhost HTTP; PUBLIC_MEDIA_BASE_URL is HTTPS r2.dev; Cashfree mode is sandbox. Actual Cloudflare public access/domain mapping and staging host are not verified. Existing next start blocker remains the r2.dev production-media validation. Next.js 16.4.6 requires Node >=20.9; local Node 24.18.0; no repository Node pin. Netlify's automatic OpenNext adapter and published-only scheduled-function execution require deployed confirmation. No build, production-like runtime, provider action or deployment performed. Phase 22A preparation complete; Phase 22B not started. Staging blocked until owner verifies bucket permissions and approves HTTPS site/media origins, isolated credentials and database. See Phase 22 staging guide; public legal/tax and secret-rotation gates remain separate.

Phase 22A validator correction: APP_URL now stands alone without forcing RESEND_API_KEY/EMAIL_FROM. Supplying either email setting still requires its partner and APP_URL. This allows safe staging with email delivery unconfigured. Focused env tests 17/17, application/test TypeScript, focused ESLint and diff check PASS. No real email sent.
