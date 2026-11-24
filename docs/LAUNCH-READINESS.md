# MoneyTreeVentures — Phase 5.2 Launch Readiness

## Phase 2 authentication update (2026-11-20)

- Implemented the centralized sole-owner admin policy, owner-only bootstrap checks, public `/admin/login`, the customer login link, account/admin logout controls, and a 10-second session-check timeout with retry. Existing Better Auth provider and callback route remain in place.
- `npm run test:admin` (16 passed), `npm run test:auth` (21 passed), full `npm test` (236 passed, 1 Mongo replica-set test skipped, plus 2 mocked Netlify tests), `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npm run test:smoke` passed locally.
- Browser checks used an intercepted anonymous session response: login routes rendered at 390/768/1440px with no horizontal overflow; customer-to-admin navigation, Google button presentation, theme switching, and visible keyboard focus worked. No OAuth flow was started.
- A separate unmocked local session request attempted MongoDB connectivity from the configured local environment and failed with `mongodb.connection.initial_failure` after about 39 seconds. No successful database session, role update, OAuth, or logout was verified. Do not treat `.env.local` presence as an operational database check.
- Phase 2 is **partially verified**. The owner has now confirmed a non-production database target, but direct account diagnostics from this execution environment remain blocked by SRV DNS timeout; the real owner session/dashboard and any bootstrap are still unverified. See [Phase 2 report](phases/PHASE-02-AUTHENTICATION.md) and [Phase 2.3 report](phases/PHASE-02-3-ADMIN-ACCESS.md).

## Phase 2.1 MongoDB/auth verification update (2026-11-20)

- Root `.env.local` is loaded by Next.js `next dev`; the Mongo service reads validated values lazily. The configured URI is an Atlas SRV endpoint and the database name is `moneytreeventures`, but that does not establish whether the target contains development, test, or production data.
- SRV lookups timed out through both the OS resolver and the Google DNS servers set by `dev-dns.cjs`. DNS/network resolution is the first observed failure. No MongoDB ping, collection query, write, OAuth, or bootstrap was completed. Atlas IP access, TLS, credentials, and database permissions remain untested.
- The previous `admin.api.request_failed` events may be emitted for sanitized Mongo errors, but their historical build-time instances cannot be attributed to Mongo from the available logs. The failure event stores no stack/correlation sufficient to prove the cause.
- At the Phase 2.1 checkpoint, Phase 2 remained **partially verified** because environment classification and connectivity were unresolved. The owner has since confirmed a non-production target; fresh SRV DNS resolution still times out from this execution context. See [Phase 2.1 verification](phases/PHASE-02-1-VERIFICATION.md) and the later [Phase 2.3 report](phases/PHASE-02-3-ADMIN-ACCESS.md).

## Phase 2.3 admin access blocker update (2026-11-21)

- Source confirms `/admin` is gated by verified owner identity and an active application profile with `role: "admin"`. The approved secure bootstrap has not run; new profiles default to `customer`, so missing role provisioning is the leading explanation, but the live owner role was not read.
- Admin login source passes the fixed `/admin` callback to Better Auth. No callback or AdminGate source defect was confirmed.
- An unauthenticated local `GET /admin` returned HTTP 200 with a streamed redirect to `/admin/login` and no admin navigation. Authenticated unauthorized responses also render a denial page; HTTP 200 alone is not evidence of dashboard access.
- The Next.js instant-navigation warning is separate from authorization. The synchronous admin page has no session logic; the layout gate is under Suspense. The exact warning text was unavailable, so its specific trigger remains unverified. No validation opt-out was added.
- The owner confirmed the target is non-production. A fresh read-only Mongo connection using both `@next/env` and the `dev-dns.cjs` override used by `npm run dev` failed at Atlas SRV DNS (`ETIMEOUT`) before ping or account read. The Next.js process's `mongodb.connection.connected` log is owner-reported and was not reproducible in the fresh diagnostic process. No owner account/session records were queried; no bootstrap or role change occurred. Real admin dashboard access remains **not verified**. See [Phase 2.3 report](phases/PHASE-02-3-ADMIN-ACCESS.md).

## Phase 1 foundation recovery update (2026-11-20)

- Removed `next/font/google` Geist imports because the build environment cannot fetch Google Fonts and no local font assets exist. The system-first stack keeps the existing Geist CSS variable names and falls back without external requests.
- Added a compact `Suspense` boundary around the route-aware navbar. Next.js 16 with Cache Components requires this when `usePathname()` cannot resolve an unknown dynamic product slug during prerender.
- `npm run build`, production smoke, the existing client-bundle exact-value scan, `npm test`, browser test, lint, TypeScript, and local environment schema validation passed. See [Phase 1 report](phases/PHASE-01-FOUNDATION.md) and [test register](TEST-REGISTER.md) for commands and limits.
- `.env.local` and root `debug.log` are ignored by Git. The log was not deleted; common credential patterns were absent. Its full contents and the complete untracked source set still need owner review before publication/staging.
- No service connectivity, production operation, deployment, or external account was tested. Two safe `admin.api.request_failed` log events appeared during successful build prerender and remain unexplained.

## Phase 0 audit update (2026-11-20)

- Local `.env.local` was loaded and passed the server environment schema. The configured Cashfree mode is sandbox. No MongoDB/provider operation was attempted; `MONGODB_TEST_URI` is absent.
- Sole-admin authorization is not launch-ready: the active DB-role gate and bootstrap command do not enforce verified Google email `moneytreeventuress@gmail.com`. `/admin/login` is missing; anonymous `/admin` redirects to `/login`.
- The account has no logout button. Sign-out is available only on the authenticated state of `/login`.
- A custom root 404 route is missing. An unknown path returned 404 locally; an invalid product slug returned not-found UI with HTTP 200 in the local dev server.
- Website language is currently Roman Hinglish, not the newly required English default. No language switch, review system, contact submission form, or product seed script was found.
- No `seed-data.ts` source was present in the repository; no replacement data or records were created.
- Homepage `FeaturedProducts` still displays seven hardcoded resource-style cards that are not catalogue records and do not link to product details. Do not present them as real products; connect only owner-approved published records or withhold that collection.
- The currently configured sitemap does not include individual product slugs. The production build still fails on Geist/Geist Mono Google Font fetches, so production smoke and client-bundle scanning remain blocked.
- The worktree contains an untracked, unignored `debug.log`; review and exclude it before publishing. Common-format scans are not sufficient to declare the repository safe to publish.

Audit date: 2026-11-20. This report records checks run in the local workspace only. No production account, database, deployment, DNS, live payment, or real email delivery was used.

## Passed in this audit

- `npm test`: 230 tests passed; one MongoDB transaction integration test skipped because `MONGODB_TEST_URI` was not configured. The Netlify scheduled-handler tests passed with local mocks (2 tests).
- `npm run lint` and `npx tsc --noEmit` passed.
- `npm run test:browser` passed its existing product-media browser test. It verifies the video/thumbnail selection, paused video controls, poster, `preload="none"`, `playsInline`, and safe handling of invalid media.
- Local route checks returned HTTP 200 for `/`, `/products`, `/about`, `/contact`, `/faqs`, `/privacy-policy`, `/terms`, `/refund-policy`, and `/shipping-delivery`.
- Headless browser checks at 390, 768, and 1440 CSS pixels found no document-level horizontal overflow. The mobile menu exposed the required routes, closed on Escape, and returned focus to the menu button. Theme toggling to dark mode worked.
- The automated suite covers admin authorization and product lifecycle/service policies; customer ownership and entitlement policies; cart and checkout authentication; Cashfree signature/raw-body and size-limit handling; PDF/R2 signing policy; booking authorization; and outbox behavior. These are local tests/mocks, not live provider checks.
- `git diff --check` exited successfully for tracked changes. `.env.local` is ignored by Git.
- A non-disclosing scan for common credential formats found no matches in the one-commit Git history (17 unique blobs). A working-tree scan found MongoDB credential-URI patterns only in test fixtures. This is a pattern scan, not a complete secret audit.

## Failed checks

- `npm run build` failed before application compilation because the existing `next/font/google` imports in `src/app/layout.tsx` could not fetch Geist and Geist Mono from `fonts.googleapis.com` in this network-restricted environment.

## Skipped or blocked checks

- Production-mode smoke test was not run: there is no valid fresh `.next/BUILD_ID` after the failed build. Running it against stale/dev assets would not verify this source state.
- Client-bundle secret scan was not run for the same reason: no valid fresh production bundle exists. The working-tree pattern scan above does not replace it.
- The admin UI create/edit/media/price/draft/publish/archive journey was not run against a local database with disposable test records. Admin service/API tests passed, but do not prove the entire UI journey.
- A valid published product-detail URL and customer/admin signed-in browser journeys were not verified against a configured non-production database.
- `git diff --check` does not inspect untracked files. Most application files in this working tree are untracked, so review/track the intended files before relying on that check.

## External checks still pending

- MongoDB replica-set transaction and index verification using only a dedicated disposable non-production database.
- Cashfree sandbox checkout, verified webhook, duplicate/out-of-order delivery, interrupted payment, and refund reconciliation.
- Cloudflare R2 test upload, private object checks, personalized PDF generation, signed URL expiry, and rate limiting.
- Resend sandbox delivery, bounce handling, and verified refund/booking messages.
- Netlify scheduled-function execution and deployment recovery in staging.
- Staging security, customer ownership isolation, environment separation, backups, and recovery.
- Domain, HTTPS, and redirect checks after explicit owner approval for DNS changes.

## Security risks and owner actions

- No Content-Security-Policy is configured. Test a CSP in staging against Next.js Cache Components, Google OAuth, Cashfree Hosted Checkout, and current assets before enforcing it. Do not treat robots rules as access control.
- `debug.log` is present as an untracked file and is not ignored by `.gitignore`. Review it for private data and exclude or remove it before publication. Do not publish this working tree until untracked files and Git history have been reviewed.
- The common-pattern scan was limited; the production client-bundle scan and a dedicated secret scanner remain pending. Keep `.env.local` and all credentials out of Git and never use `NEXT_PUBLIC_` for server secrets.
- Current security headers are configured in `next.config.ts`, but their production responses were not verified because the production build/smoke test could not run. Verify headers and HTTPS behavior in staging. Add HSTS only after all approved hosts serve HTTPS.
- `src/app/sitemap.ts` lists the homepage, catalogue, and public information/legal pages, but not individual published product slugs. Add dynamic published-product URLs and verify canonicals before launch.
- The PDF watermark uses a standard font with limited non-Latin character support. Confirm required name scripts and use a properly licensed embeddable font before relying on unsupported characters.
- Legal pages remain owner-review drafts. Confirm policy wording, business identity, contact/support channels, and applicable compliance details before publication.

## Release status

**Phase 0 snapshot: not launch-ready.** At that checkpoint, the production build failed and the smoke/client-bundle checks were blocked. The Phase 3 checkpoint below supersedes those build and smoke results: the build and smoke now pass, with two unresolved sanitized admin API errors during prerender. Non-production integrations, signed-in customer/admin journeys, and staging checks remain outstanding. Complete external checks only with approved sandbox/staging configuration; do not use production credentials for these tests.
## Phase 3 runtime and admin checkpoint (2026-11-21)

- The admin home now reads aggregate counts and the admin category screen reuses existing category services and policy. The protected layout and owner-only policy remain in place.
- Local full automated tests passed: 241 passed, one skipped; two mocked scheduled-handler tests passed. TypeScript and ESLint passed; see the current Phase 3 test-register entry.
- The owner reports that Google-authenticated `/admin` access is fixed. An authenticated owner session was unavailable to this verification, so real access remains unverified here.
- Build prerender still emits two sanitized `admin.api.request_failed` events (`errorName=Error`). The build completes, but those errors are not explained and require investigation before treating admin runtime as fully clean.
- No production database, payment, storage, email, DNS, deployment, role bootstrap, or seed operation was performed.
- Launch readiness remains blocked by previously recorded build/integration/staging/legal gaps and the missing authenticated end-to-end admin workflow verification. See [Phase 3 report](phases/PHASE-03-RUNTIME-ADMIN.md).

## Phase 3.1 admin product-list checkpoint (2026-11-21)

- Confirmed source behavior: the Mongoose model and validators use `name`; admin `listProducts` has no projection and returns lean records; the admin route forwards the service result without a title/name serializer. The UI runtime error establishes that at least one received item lacked a usable name, but its stored source record was not inspected. A legacy `title`-only DB record is possible, not confirmed.
- The admin list now renders malformed records with explicit warnings, safe name/slug/thumbnail/type/status/price fallbacks, and guarded lifecycle controls. Legacy `title` is displayed only as a temporary repair hint; canonical `name` remains required.
- Focused catalogue tests passed (65); the Chromium component fixture test passed (1); TypeScript and ESLint passed. No product record or order snapshot was changed.
- The actual protected `/admin/products` route was not tested in an authenticated browser session, and no database record was queried. Existing-record status remains unknown; do not launch a migration without a separate review.
- The production build and TypeScript check passed after the Phase 3.1 source change. Build prerender emitted two sanitized `admin.api.request_failed` events (`errorName=Error`), which remain unexplained. ESLint passed without findings.

## Phase 4 media-upload checkpoint — 2026-11-21

Local implementation is present; launch readiness remains `PARTIALLY_VERIFIED`. The admin navigation fix preserves the protected layout gate and isolates uncached dashboard counts with Suspense, but the dev warning has not been reproduced with an authenticated owner session. Product image/video uploads use a separate media-only R2 staging/public bucket pair; no R2 configuration or real upload was tested. Build passed with two unexplained sanitized admin-count errors during prerender. See [Phase 4 media report](phases/PHASE-04-MEDIA-UPLOAD.md). Final provider test rerun and dependency install integrity remain pending.

Owner actions before launch: configure separate non-production media buckets, restricted credentials, bucket/domain/CORS settings; verify local authenticated admin navigation; complete dependency installation/check; run provider and staging integration checks. Existing legal, deployment, MongoDB transaction and other external blockers remain unchanged.

Verification update — 2026-11-21: provider 36/36, catalogue 68/68, models 14/14, env 16/16; lint, TypeScript, production build and local Chromium component tests pass. No owner-authenticated route or Cloudflare provider access was available. Final build still logs two sanitized admin-count errors. Phase remains partially verified; see the Phase 4 report.

## Phase 5 product-management checkpoint — 2026-11-21

Product CRUD and lifecycle are covered by existing local services and focused tests. Listing/component refinements and compare-at clearing regression pass locally. End-to-end owner acceptance is not complete: no authenticated browser session, disposable DB CRUD, private test PDF, or R2 upload was used. Plain production build is blocked by `.env.local` using an `r2.dev` media URL; an isolated build with a reserved example HTTPS host and dummy localhost database passed, followed by production smoke. The isolated build emitted two sanitized admin dashboard-count errors because its dummy DB was unavailable; these remain unresolved and separate from product service tests. See [Phase 5 report](phases/PHASE-05-PRODUCT-CRUD.md).

Before Phase 6, the owner must provide actual descriptions, prices, category mappings, PDF files/assets, and SEO content for the named products, approve a disposable seed target, and decide whether target-audience information requires a schema addition. Keep legacy paid `video`/`video_and_files` formats unresolved until the owner decides whether to omit, replace, or model them. Do not mark the product workflow fully verified until the owner browser checklist is completed.
## Phase 6 checkpoint — 2026-11-21

**Status: not launch-ready.** Phase 6 added the admin CTA treatment, trusted owner navigation decision, and source-only seed plan. Local source tests, authorization/navigation policy tests, focused Chromium component tests, TypeScript, targeted ESLint and a no-mutation seed dry run passed. These checks do not verify signed-in navigation, database contents, R2, uploaded PDF assets, or a live seed.

- Seed source: 4 categories and 10 products. The current PDF-only business decision allows only `Real vs Scam Job Checker` (PDF) and `1:1 Clarity Call` (Call Guidance) to map as drafts. Eight source records promise paid video/video-plus-files or an incompatible video bundle and are blocked. No source items were force-converted to PDF bundles.
- No category or product record was read, created, changed, or published in MongoDB. No PDF/media file, customer record, payment, deployment, or production service was accessed.
- Owner-reported previous product creation/publication remains owner-reported; the authenticated browser journey was not independently verified here.
- Before seed apply: replace/approve the incompatible source copy and deliverables, decide unmapped `formatDetail`, `audience`, `tags`, and `whoShouldBuy` handling, confirm real pricing/discount and lifetime/group claims, and approve the exact disposable non-production DB. The apply command will refuse production and requires explicit flags; do not run it against production.
- Before launch, upload actual private PDF masters, validate bundle relationships, complete Call Guidance instructions, verify R2, and run signed-in owner/customer/anonymous navigation tests. The plain production build still fails during admin prerender because the existing `PUBLIC_MEDIA_BASE_URL` is an `r2.dev` host rejected by production validation. An isolated build with process-only reserved media URL and dummy localhost DB completed, but logged two sanitized admin dashboard DB errors; this does not verify integrations. No environment file was changed.
- Paid video delivery, live payments/refunds, DB apply, deployment, DNS, R2 external access, Cashfree and email integration remain unverified or out of scope.

## Phase 7 catalogue checkpoint (2026-11-21)

- Category selection and the public catalogue query/UI changes pass focused local checks: `test:catalog` 78/78, `test:models` 14/14, Chromium component fixtures 4/4, TypeScript, ESLint, isolated production build, and the overridden local production smoke test.
- The regular `.env.local` was not edited. The production build/smoke used only process-scoped safe values and a dummy localhost database; build-time admin count errors from the unavailable dummy DB do not constitute database verification.
- This does not establish launch readiness. No authenticated admin save/reload, live MongoDB catalogue query/index, responsive route matrix, or R2/Cashfree/Resend/staging test was run. Mongo indexes remain declared but unapplied. Phase 6 seed was not applied; source candidates are not evidence of database records. Owner-reported manual product work remains owner-reported.
- Before launch, run the admin category save/reopen/remove checklist and catalogue query checks against an approved disposable Mongo database after applying reviewed indexes; verify mobile/tablet/desktop route behavior and themes; complete provider and staging checks already listed above. Keep legal/product source review and Phase 6 seed decisions outstanding.
- Release remains **not launch-ready / partially verified**. See [Phase 7 report](phases/PHASE-07-CATALOGUE-SEARCH.md) and [test register](TEST-REGISTER.md).

## Phase 8 multilingual checkpoint — 2026-11-21

- Localized core customer UI is implemented for English, Hindi, Roman Hinglish, and Tamil. Untranslated labels fall back to English. Product-authored and legal copy remains source text with a source-language/owner-review notice; translations are not owner-approved.
- Locale preference uses an allowlisted, same-origin `HttpOnly`, `SameSite=Lax` cookie; URLs remain stable. The root document stays statically prerenderable under Cache Components and begins with `lang="en"`; a non-English document language is synchronized after hydration. No locale-specific URL or `hreflang` claim is made.
- i18n tests (4/4), component browser fixtures (4/4), TypeScript, ESLint, isolated production build, and production smoke (including locale cookie validation and Hindi SSR text) passed. The build used a dummy localhost database and emitted two sanitized admin-count errors; no database was verified. These checks do not prove full route rendering, responsive layout, keyboard behavior, theme interactions, or client selector interaction. Those remain pending. See [Phase 8 report](phases/PHASE-08-MULTILINGUAL.md) and [test register](TEST-REGISTER.md).
- Launch status remains **not launch-ready**; Phase 7 owner-authenticated/database checks and all provider/staging/legal blockers remain open. Phase 9 has not started.


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

Coupon preview now derives cart value from published MongoDB products and shared checkout restrictions; the cart only shows a discount for the current matching quote. Checkout retains independent validation, reservation and redemption. Previous verification recorded checkout 18/18, catalogue 78/78, Chromium 4/4 without coupon-flow coverage, TypeScript/ESLint and isolated build/smoke PASS (two sanitized DB errors in build). Final correction: coupon/cart/checkout tests 22/22, focused Chromium fixtures 6/6, TypeScript/ESLint, isolated build PASS; the focused built endpoint check passed cross-origin rejection, while the broader smoke script timed out. Real MongoDB transactions/concurrency, Cashfree payments, and authenticated customer/owner browser journeys remain NOT_VERIFIED. Existing r2.dev URL blocks an ordinary production build. Admin controls for product/category and per-customer restrictions remain a usability limitation. See [Phase 12 report](phases/PHASE-12-CART-COUPONS.md).

## Owner-assigned Phase 13 checkout/order checkpoint - 2026-11-21

Order snapshot immutability, authoritative checkout pricing, Call Guidance quantity limits, payment-attempt retry consistency, customer-scoped status checks, and safe order expiry/coupon reservation handling are implemented. Focused checkout 27/27, providers 39/39, models 14/14, auth 21/21, browser fixtures 6/6, TypeScript, ESLint, and isolated production build passed. Production smoke timed out on its first request. Real replica-set transactions/concurrency, Cashfree sandbox payment and signed callback lifecycle, authenticated customer/owner browser journeys, and late-payment reconciliation remain NOT_VERIFIED. Ordinary build continues to be blocked by the configured r2.dev media URL. See [Phase 13 report](phases/PHASE-13-CHECKOUT-ORDERS.md); release remains not launch-ready.

## Phase 14 payment reconciliation update — 2026-11-22

- Two already-existing Cashfree sandbox attempts were checked with provider GETs and verified PAID/SUCCESS with matching INR amounts. Both pending records were reconciled in the confirmed development database. A signed synthetic webhook sequence verified success idempotency and resistance to out-of-order failure, but no actual Cashfree webhook was received.
- Focused model/provider/checkout/browser tests and static checks passed; details and limitations are in [Phase 14 report](phases/PHASE-14-CASHFREE-PAYMENTS-REFUNDS.md).
- Release remains **not launch-ready**. Public HTTPS sandbox webhook delivery, authenticated customer browser verification, refund operation, and other previously listed launch blockers remain open. No Phase 15 work has started.


## Phase 14 abandoned-order follow-up ? 2026-11-22

Implemented customer-scoped history filtering for finalized expired unpaid/failed orders without paidAt. Paid, refunded, and pending orders stay visible; the service reads Mongo directly without a shared cache. Existing expiration now conservatively refuses every payment-bearing order. Maintenance reconciles attempted payments through the existing Cashfree service and preserves them, including provider errors; it never fabricates failure. No-attempt expired orders use the existing transaction, conditional status update, coupon release and audit event.

Added `src/lib/checkout/order-maintenance.ts`, a bounded, dry-run-by-default maintenance service. Purge accepts only sandbox, terminal expired unpaid/failed orders beyond retention, with an expiration audit older than retention and no payment, coupon-redemption, refund, purchase, booking, webhook or outbox dependency. Existing audits remain as tombstones and deletion adds a sanitized audit in the same transaction. Conditional deletion rechecks state and updatedAt; transaction conflicts preserve the order. Production deletion is hard-disabled. Every payment-bearing or coupon-bearing order is conservatively retained, even after confirmed failure/release. This is intentionally narrower than the eventual cleanup policy.

Proposed development retention is 30 days, configurable with ORDER_RETENTION_DAYS. It is not an approved production compliance policy. `npm.cmd run orders:maintain -- --confirm-database moneytreeventures --confirm-non-production` previews expiration without provider calls or writes. Add `--purge` for retention dry-run. Only an explicit `--apply` allows mutation. Do not run purge apply against genuine historical records before disposable-database integration passes. No database maintenance command, purge or dry-run was executed in this follow-up; no actual documents were deleted.

Netlify `expire-orders` calls the authenticated internal maintenance route every 15 minutes, gated by ORDER_EXPIRATION_ENABLED=true, ORDER_MAINTENANCE_DATABASE, APP_URL and existing OUTBOX_WORKER_SECRET. No deployment or activation occurred. Local automation can invoke the CLI through Windows Task Scheduler, with working directory D:\MoneyTreeVenture; schedule expiration separately from the purge command. No destructive production schedule is configured. Approve production retention/legal rules before adding a production deletion path.

Verification: checkout tests 30/30; focused retention policy/payment API/webhook tests 22/22 passed. Retention tests protect paid, pending, refunded, partially-refunded, recent and unfinalized states. These are fixtures, not transaction/persistence proof. Remaining required coverage: disposable Mongo tests for deletion, dependency preservation, coupon release, repeated execution and concurrent reconciliation; worker HTTP authentication integration and history refresh browser check. Payment-bearing failed attempts remain retained pending explicit provider-terminal eligibility design. Bounded oldest-first batches may require operator handling when preserved candidates fill the batch; durable pagination is still needed before unattended backlog processing is claimed complete. The two paid sandbox orders cannot meet purge status criteria and were not accessed or changed. This follow-up is PARTIALLY IMPLEMENTED / NOT LIVE VERIFIED. Phase 15 has not started.


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

See docs/phases/PHASE-16-ACCOUNT-LIBRARY.md. Bounded account-time expiration for no-attempt overdue orders, one-license quantity enforcement, checkout active-entitlement rejection, account navigation and order links implemented. Existing multi-line paid fulfillment reused. Focused tests 30/30 and TypeScript passed; no live MongoDB/browser/build check. Concurrent pre-payment checkouts, richer library, product-level Already Purchased and backlog maintenance activation remain open. Phase 17 not started.


## Phase 16 concurrent purchase follow-up ? 2026-11-22

Added `checkoutClaims` with a unique partial index on `(userId, productId)` while status is active. Each new checkout creates claims for every distinct product in the same Mongo transaction as the order. A competing overlapping cart gets an actionable conflict before payment initiation. Checkout checks index presence and fails closed until the guarded `db:indexes` migration creates it. The existing idempotency retry returns the original order. Legacy open orders without claims also block a new checkout for overlapping products. Confirmed unpaid expiration releases claims in its transaction; verified full refund releases them after entitlement revocation. Pending/unresolved payments retain claims. Paid claims remain active to align with the one-license entitlement policy. A late success after release uses existing duplicate-entitlement audit behavior; financial records remain intact and require manual exception review.

Index prerequisite: review the confirmed non-production target, then run `npm.cmd run db:indexes -- --confirm-database moneytreeventures` from PowerShell. This command was NOT executed; no development records or indexes were changed. Existing `autoIndex: false` makes the prerequisite mandatory. Concurrent transaction/unique-index behavior is NOT VERIFIED without `MONGODB_TEST_URI` and a disposable replica-set database. The local suite cannot prove race safety; create a disposable test using two sessions and verify only one Cashfree initiation becomes possible before deployment.

The product purchase action now reads customer-scoped `/api/purchases` and shows Already Purchased with My Library link for an active verified entitlement. It still shows Already in Cart for local cart state. The account library exposes product/order links and shows 12 items at a time with Show more; the server currently loads at most 100, so full server pagination and totals beyond 100 remain open. Existing order detail and bounded expiration remain as Phase 16's prior checkpoint. No real multiple-PDF fulfillment, expired-history, signed-in browser or R2 check was run.

Focused model tests 17/17 and checkout tests 30/30 PASS; TypeScript, focused ESLint and git diff --check PASS. No production build or real MongoDB test. Phase 16 is PARTIALLY VERIFIED and requires the index migration, disposable concurrency test and authenticated browser checks before calling it complete. Phase 17 has not started.


## Phase 17 booking checkpoint ? 2026-11-22

See docs/phases/PHASE-17-CONSULTATION-BOOKINGS.md. Existing Call Guidance booking flow now checks verified payment evidence for customer requests/admin transitions and distinguishes scheduled from confirmed. Owner schedule writes serialize on a Mongo lock and check interval overlap. Booking/purchase tests 17/17, TypeScript, focused ESLint and diff check PASS. Real database concurrency, authenticated browser and live consultation purchase NOT_VERIFIED. Owner availability and cancellation/refund policy decisions remain open. Phase 17 PARTIAL; Phase 18 not started.

## Phase 18 transactional email readiness (2026-11-22)

Phase 18 implementation is complete; live delivery is NOT_VERIFIED. Local Resend/sender/app/worker variable presence is confirmed without exposing values, but the local APP_URL is HTTP localhost. Sender/domain verification and Resend key validity were not confirmed: the read-only Resend status request could not reach the provider. Source contains a 15-minute Netlify outbox schedule and authenticated bounded worker, but deployed schedule and deployment environment are unverified. The model declares the unique partial outbox deduplication index; actual development database index metadata could not be read. Focused fulfillment/outbox tests 30/30 and scheduled handler tests 2/2 pass; model tests 17/17 pass; TypeScript, focused ESLint and diff check pass. No actual email was sent. Before launch, owner must verify the sender in Resend, set a public HTTPS APP_URL and matching worker secret in both runtime environments, verify the deployed schedule, and confirm the actual database index read-only. A one-recipient test email still requires separate owner authorization.

Security prerequisite: a prior diagnostic search inadvertently emitted `.env.local` values into tool output. Rotate `RESEND_API_KEY` and `OUTBOX_WORKER_SECRET` before enabling or testing delivery. No values are repeated and no rotation was performed here.

## Phase 19 public policies and billing - 2026-11-22

Seven public pages and footer/sitemap links are implemented; the five policy documents are clearly marked as drafts with last-updated date 22 November 2026. Local route rendering returned HTTP 200 for all seven. Legal and tax launch approval is NOT_READY: public legal entity name and grievance officer details remain missing; the owner's non-GST declaration conflicts with an inspected 18% inclusive-tax calculation and non-zero immutable order snapshots. No tax settings or historical data were changed, and no receipt generator was added. Authenticated account summaries remain customer-scoped and are explicitly not called receipts. Privacy implementation gaps include no self-service deletion and unconfirmed retention/consent/request-handling policy. Consultation cancellation/rescheduling terms need owner approval. DPDP Act/Rules have phased commencement, with several core provisions scheduled 13 May 2027 per MeitY Gazette notices. Resend delivery remains NOT_VERIFIED; rotate the Phase 18 API key and worker secret before any send. See `docs/phases/PHASE-19-LEGAL-BILLING.md` for tests, sources and blockers.

## Checkout 400 regression checkpoint - 2026-11-22

The reported `items` validation error was opaque because the normalizer replaced detail text and the checkout screen showed generic feedback. Current cart item JSON matches the order API schema. Specific error codes and recovery links now separate owned products, active unresolved checkouts, duplicate items, bad quantities, empty/malformed carts and unavailable products. Tests: checkout 36/36, error normalization 11/11, TypeScript, focused ESLint and diff check PASS. Actual owner checkout was not repeated here; the precise branch behind the old request remains unconfirmed without cart/DB evidence. Launch checkout journey remains NOT_VERIFIED. No payment or database records changed.

## PDF repurchase launch gate - 2026-11-22

The owner-approved PDF repurchase policy supersedes the earlier permanent one-purchase rule. Source implementation includes free-library guidance, affirmative current-price confirmation, authenticated server acknowledgment checks, completed versus unresolved claim states, per-order purchase history and refund isolation. Existing `checkout_claim_one_active_product` remains unique for active unresolved attempts. The purchases collection still needs the guarded development index migration before repeat checkout can proceed; the server fails closed until the obsolete unique active-purchase index is gone and `purchase_user_product_history` exists. The migration has NOT been run, and actual index metadata is NOT_VERIFIED. Focused tests pass (checkout 38/38, models 18/18, selected services 46 PASS and 2 disposable MongoDB SKIPPED); real repeat-payment/refund/concurrency and authenticated browser flows remain NOT_VERIFIED. No production or provider actions were taken.

## Customer account launch gate - 2026-11-22

Account overview, paginated order history, reversible archive, distinct PDF library pagination and consultation navigation are implemented. Historical expired/failed/refunded orders remain visible, and permanent order purge is disabled pending approved retention rules. Authenticated browser, real database pagination/archive, live personalized downloads and the separate purchase-index migration remain NOT_VERIFIED. No deployment or provider transaction occurred.

PDF repurchase is not ready for checkout until the owner reviews the read-only purchases-index preflight and runs the guarded non-production migration if appropriate. Required indexes: unique `purchase_order_line_unique` on `{ orderLineId: 1 }`; nonunique `purchase_user_product_history` on `{ userId: 1, productId: 1, grantedAt: -1 }` with no partial filter; legacy active-purchase index must be removed by the guarded migration. Live metadata remains NOT_VERIFIED. No Codex migration or data changes occurred.

Repurchase migration remains OWNER ACTION REQUIRED. Atlas evidence identifies one preserved legacy purchase with no order association; it must remain untouched. Review fresh read-only preflight and then run the guarded nonproduction migration. Checkout remains fail-closed until the two required purchase indexes are verified and obsolete legacy uniqueness is removed.
Migration code is locally verified, but database migration remains pending. Required owner sequence: preflight then review counts/indexes, guarded non-production migration only if classification is still the expected single legacy row. No Codex database mutation occurred.

## Phase 20 launch gate — 2026-11-23

PARTIAL. Origin protection added to selected authenticated mutations; broad route review and remaining Phase 20 passes are required. All previously recorded legal, tax, secret rotation, email, webhook, R2, concurrency, media URL and migration blockers remain open. No deployment readiness claim is made.

Phase 20 security continuation: shared browser mutation guard now uses configured Better Auth origin and covers customer booking availability. Standalone origin checks, signed-in browser flows, real concurrency, R2, webhook delivery, worker deployment, performance and accessibility remain launch review items. Existing tax/legal/secret/media/policy blockers remain open.

Same-pass update: the reviewed standalone coupon/support/review Origin comparisons no longer rely on request URL. Live signed-in browser checks and remaining Phase 20 security review are still required.

Phase 20 Task 2: SEO URL publication now requires configured public HTTPS APP_URL; otherwise robots disallows indexing and sitemap publishes no URLs. Route performance, LCP/INP/CLS, 390/768/1440 viewport and authenticated accessibility remain NOT_MEASURED/NOT_RUN. Security, legal, tax, secret rotation, R2, webhook, concurrency, media configuration and consultation blockers remain open.

Local runtime now responds on localhost and 127.0.0.1, but development logs show MongoDB connection failures that degrade catalog/review/auth-backed sections. Exact Atlas/network cause remains unknown because diagnostics redact connection details. Development response timings are not production performance measurements. Owner must verify local DB reachability/Atlas network access in their browser environment; no database writes were made.

MongoDB remains a launch blocker: intermittent DB-backed route failures and auth errors are logged. Shared connection manager tests pass, but no successful live ping or stable route verification was obtained; exact Atlas network/DNS/auth cause remains UNKNOWN. Safe diagnostics now record category and duration without driver messages. Owner must run a bounded read-only ping in their Windows environment and confirm Atlas IP access/DNS with the resulting safe category.

Phase 20 Task 2 remains unverified in agent runtime: current SRV ETIMEOUT persists despite owner-reported local DNS recovery. Public HTML can respond while DB-backed content stalls. A real 390px cart loading-state screenshot is insufficient for launch UI approval. Owner browser evidence or restored agent DNS is required for performance/responsive gate. All earlier launch blockers remain.

Phase 20 Task 2 continuation checks: focused browser fixtures 3/3 and TypeScript/ESLint/diff check PASS. Live populated route, authenticated accessibility, responsive matrix and Web Vitals remain open due agent-runtime DNS SRV timeout.

Phase 20 Task 3 infrastructure checkpoint (24 November 2026): read-only production/full dependency audits report zero advisories. Private route no-store headers and conditional one-day HTTPS HSTS were added; baseline nosniff, frame denial, referrer and permissions headers remain. Scheduled workers now reject remote HTTP APP_URL before sending bearer credentials. Next production build succeeds locally, but next start fails because current PUBLIC_MEDIA_BASE_URL uses r2.dev, which production validation rejects. Public HTTPS APP_URL/custom media domain, Netlify deployed schedule/runtime, CSP browser rollout, Resend secret rotation/live delivery, Cashfree webhook, R2 PDF, Mongo concurrency, legal/tax and owner Task 2 browser measurements remain launch blockers. No deployment readiness claim.

Phase 20 final closeout (24 November 2026): local source hardening workstream COMPLETE. Admin API request-time boundary correction removed two recurring prerender error logs in two consecutive 53/53-page builds; admin tests 19/19 PASS. Current private PDF, private media staging and public media bucket variable names are distinct, but actual Cloudflare public-access settings and domain-to-bucket mapping are NOT_VERIFIED. **CRITICAL:** do not attach or activate the public media custom domain until the owner confirms it points only to the public product-media bucket and that private PDF and staging buckets have no public domain or enabled r2.dev URL. Existing production runtime smoke remains BLOCKED by the current r2.dev media URL. Owner browser viewport/performance, authenticated browser, deployed headers, scheduled jobs, Cashfree webhook, R2 PDF, transactional email and Mongo concurrency remain NOT_VERIFIED. GST, legal seller/policies, consultation policy, secret rotation and Atlas hardening remain open. No production readiness or Phase 21 entry is claimed.

Phase 21A checkpoint (24 November 2026): PARTIAL. Added tests/e2e/local-journey.test.mjs using existing Chromium/node:test, isolated anonymous profile and localhost-only target; no dependencies installed. Actual browser run BLOCKED at CDP Page.enable (15-second timeout), before app navigation. No E2E journey passed. Supporting deterministic/MOCKED tests: 26 PASS; disposable Mongo claim tests: 2 NOT_RUN (MONGODB_TEST_URI absent). TypeScript, focused ESLint and diff check PASS. Owner manual viewport result 6/6 is preserved; Web Vitals NOT_MEASURED. Authenticated customer/admin journeys MANUAL_REQUIRED; full interaction automation remains unfinished. See docs/phases/PHASE-21-END-TO-END-QA.md for exact PowerShell commands and remaining checklist. All production media, R2 isolation, webhook, email rotation/delivery, scheduler, Mongo, GST/legal, consultation and Atlas gates remain open. No deployment, payments, refunds or emails.

Phase 21A Task 2: original real-browser smoke 6/6 PASS per owner Windows run. New interactive customer scenarios are implemented but NOT_VERIFIED because the agent Chromium control channel timed out before navigation. Valid coupon removal, authenticated journeys, staging providers and all existing launch gates remain open.

Phase 21 Task 2: owner live browser suite 7/9 PASS before the test correction; product-detail image and enclosing journey failed. Selector/timing and ID-versus-slug fixture defects were corrected. Corrected live image/category result remains NOT_VERIFIED until the owner reruns the suite; actual media HTTP status and Cloudflare reachability are unknown. Other launch gates remain unchanged.

Phase 21 Task 3: owner confirmed anonymous browser suite 10/10 PASS in two independent Windows runs. Authenticated customer/admin verification workflow is ready for owner execution with manual Google login in a fresh temporary browser profile; no signed-in browser result has been reported. PDF ownership/revocation, cross-customer denial, archive, repeat purchase, CSRF browser behavior and logout remain NOT_VERIFIED. Other production and staging gates unchanged.

**P0 payment synchronization blocker (24 November 2026):** Two owner-observed sandbox orders show provider FAILED/PAID while local Order History remains PENDING. Authenticated on-demand and separately gated scheduled recovery and a read-only two-order diagnostic are implemented, but actual provider attempt data, database comparison, fulfillment and controlled recovery are NOT_VERIFIED. Do not claim payment integrity or launch readiness until both orders are diagnosed and reconciled under owner approval and webhook/scheduler delivery is verified on public HTTPS staging. No payment, refund, email or DB write occurred in this task.


Phase 21 automatic status/PDF follow-up (24 November 2026): local UI polling and on-demand PDF label corrections are tested, and the Netlify schedule can now invoke reconciliation when PAYMENT_RECONCILIATION_ENABLED=true even if expiration is off. Local .env.local lacks PAYMENT_RECONCILIATION_ENABLED and ORDER_MAINTENANCE_DATABASE; no configuration was changed. Deployed worker environment, authenticated browser behavior, real Cashfree status, private R2 generation and recovery of the two historical orders remain NOT_VERIFIED. P0 payment-integrity launch blocker remains.


Phase 21 P0 targeted payment recovery (24 November 2026): owner read-only evidence confirms one paid order is fully settled and must not be mutated. A second sandbox order is provider EXPIRED/FAILED but locally PENDING with an active checkout claim. A narrowly guarded, single-order recovery command is prepared and unit tested, but the agent read-only run hit DNS SRV ETIMEOUT before database access. No apply occurred. The stale order, claim release, final Order History display and late-success integration remain NOT_VERIFIED. Payment-integrity launch blocker stays open until the owner dry-run and separately approved recovery succeed.


Phase 21 P0 failure/retry correction (24 November 2026): automatic terminal provider verification now drives existing failed-payment expiration and claim release; uncertain attempts remain pending. Expired/failed orders expose a deliberate, status-checked new checkout action, while the old order remains in history. Background reconciliation can target the configured Cashfree environment with bounded one-order scheduled batches, but Netlify settings/job execution and real transaction behavior are NOT_VERIFIED. Owner dry-run for the known sandbox order was eligible; apply was not run. P0 payment integrity and retry launch gate remains open until real recovery, claim release and signed-in browser retry are verified.

The specifically diagnosed historical order 6b0341108ffd602387cde275 has a temporary automatic-status-recovery hold while it remains awaiting_payment; ordinary new orders use automatic finalization. The guarded owner-approved recovery command bypasses this hold through existing verified lifecycle services. Remove the hold only after approved recovery and verification; signed provider webhook handling remains intact.

## Phase 21 final QA/staging gate - 24 November 2026

Owner-reported normal-Chrome Cashfree sandbox checkout opening and anonymous Windows E2E 10/10 twice are preserved. This agent's focused regressions: 284 PASS, 4 SKIP; anonymous Chromium 0/1 because Page.enable timed out before navigation. Application/test TypeScript, admin CLI compile, focused ESLint and diff check PASS. No payment, refund, email, database mutation or deployment was performed. Historical expired order final state remains unknown: guarded read-only check failed at Atlas DNS SRV ETIMEOUT before reading data. Signed-in payment-to-PDF, terminal failure/retry, Purchase Again, account/admin isolation and real download need owner normal-Chrome evidence; provider POST opening is not proof of PAID. Category A staging blockers: verify private/public R2 isolation, staging credentials, approved HTTPS APP_URL and media origin, production runtime start, and no critical payment integrity defect. Category B is staging-only verification: public Cashfree webhook, Netlify jobs, deployed headers, real Resend delivery, production-like auth and deployed private PDF access. Category C public-launch blockers: GST/tax, seller identity, approved legal/contact/grievance and consultation policies, secret rotation, Atlas network restriction and unresolved payment/entitlement issues. Phase 21 source handoff is complete but final real-world QA remains blocked; do not mark staging or public launch ready. Phase 22 not started.

## Phase 22A staging readiness - 24 November 2026

Preparation documentation is complete, but staging deployment is BLOCKED. Source separates private PDF masters/personalized copies (R2_BUCKET_NAME), private product upload staging (R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME) and public product media (R2_PUBLIC_MEDIA_BUCKET_NAME); the local configured names are pairwise distinct. Actual Cloudflare public-development-URL and custom-domain settings have not been seen. Treat private-bucket exposure or a public domain attached to a private bucket as CRITICAL. Current PUBLIC_MEDIA_BASE_URL is HTTPS r2.dev, so production-like runtime still fails existing validation; approved HTTPS staging APP_URL, media custom domain, isolated DB/OAuth/Cashfree/R2/Resend setup and Netlify scopes are pending. Published Netlify scheduled functions will run automatically; do not publish staging with production data or a live Resend key. Phase 21 paid-to-PDF, failed retry, real R2, webhook, email, concurrency and historical failed-order recovery remain unverified. GST/tax, seller/legal/grievance, consultation policy, secret rotation and Atlas access remain public-launch gates. Phase 22B/deployment not started. See docs/phases/PHASE-22-STAGING-LAUNCH.md.

Phase 22A email-isolation correction: staging APP_URL can now be set while Resend credentials are absent; partial Resend configuration remains rejected. Focused env tests 17/17 and TypeScript/ESLint/diff check PASS. This enables a no-email staging configuration but does not suppress the deployed outbox schedule; use an isolated database and do not configure real customer recipients or Resend credentials before a controlled test.
