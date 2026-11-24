# Phase 21A: local browser QA

Status: PARTIAL. The initial actual-application browser harness is implemented; full customer/admin journey coverage is not complete.

## Task 2 extension - 24 November 2026

Owner Windows run of the original suite: **PASS 6/6**, including four page renders and a catalogue API response with published data. This is owner-reported real Chromium evidence. The existing assertions remain intact.

The same harness now adds three bounded interactive scenarios: catalogue search/category control and product detail/image/button checks; add-to-cart, one-item restriction, INR subtotal, reload persistence, invalid coupon feedback, anonymous checkout sign-in gate, removal and empty cart; plus empty checkout after removal. It selects a published PDF from the actual API response and skips fixture-dependent actions when no suitable product exists. It uses a fresh temporary profile, DOM condition waits, Chrome input events, localhost-only targeting and ignored failure screenshots. It does not submit an order, create a payment, use Google OAuth, or modify coupons. A real valid coupon/remove-coupon path and a multi-PDF cart still require approved fixtures and are NOT_RUN.

Agent execution of the extended suite: **BLOCKED** at Chromium CDP `Page.enable` after 15 seconds, before navigation. This is the same agent control-channel limit; the owner has shown the original suite works on Windows. The new interactive scenarios are **NOT_VERIFIED** until an owner run. Focused browser component tests **2/2 PASS**, TypeScript, focused ESLint and `git diff --check` PASS. Existing deterministic/MOCKED 26/26 and two MongoDB concurrency skips remain as recorded. Authenticated journeys remain MANUAL_REQUIRED, and all staging/launch gates remain open.

Owner command (with the dev server already running):

```powershell
Set-Location D:\MoneyTreeVenture
$env:E2E_BASE_URL = 'http://localhost:3000'
node --test tests/e2e/local-journey.test.mjs
```

The existing tooling uses node:test and installed Chromium directly. No Playwright package or duplicate framework was installed. `tests/e2e/local-journey.test.mjs` uses Chromium's debugging protocol, a fresh temporary browser profile, localhost-only targeting, bounded commands, no retries and failure screenshots in ignored `.e2e-artifacts`. It reuses a running server and never creates orders or calls payment/refund/email APIs. It checks public page structure and actual catalogue API data; this is separate from the older browser fixture tests.

Execution: the first probe found no accessible server (BLOCKED). Port 3000 had no listener, so the existing dev command was started. The browser run then failed with a bounded browser command timeout before any journey was verified. This is a browser/runtime-access limitation; it does not establish an application defect or a MongoDB root cause. No public journey PASS is claimed.

Supporting checks: 26 deterministic/MOCKED pricing, purchase-access, refund-isolation and outbox checks PASS. Two real MongoDB claim/concurrency checks NOT_RUN because MONGODB_TEST_URI is absent. TypeScript, focused ESLint and git diff --check PASS. These checks do not prove real Cashfree, database race safety or live fulfillment.

Owner-reported responsive checks: 390/768/1440 widths in light/dark, 6/6 PASS (manual evidence only). LCP, CLS and INP NOT_MEASURED. Authenticated customer and owner journeys MANUAL_REQUIRED; no session was supplied, saved or bypassed.

## Owner execution

In PowerShell, from D:\MoneyTreeVenture, reuse the running dev server; if none is running, start `npm.cmd run dev` in terminal one. In terminal two:

```powershell
Set-Location D:\MoneyTreeVenture
$env:E2E_BASE_URL = 'http://localhost:3000'
node --test tests/e2e/local-journey.test.mjs
```

If browser discovery fails, set CHROME_PATH to the installed Chrome/Chromium executable. Reports contain test outcomes only; do not publish screenshots containing account data. Never use an authenticated personal browser profile with this anonymous harness.

## Remaining journey coverage

MANUAL_REQUIRED with an approved disposable development product/account: verify homepage data, catalogue search/filter, product detail/image load, adding/removing a PDF, single-quantity rules, invalid/valid coupon feedback, correct review amount and keyboard/focus/error announcements. Stop before creating a payment. These interactions are not yet automated by the initial harness.

MANUAL_REQUIRED: sign in through Google normally; check account, library, order status filters, authorized/unauthorized order detail, archive/unarchive only disposable records, intentional Purchase Again confirmation, repeat-purchase library grouping, owned/revoked PDF access and booking availability. Use existing verified disposable records; never fabricate provider success. In the approved owner session check dashboard, products, categories, bookings and available order/refund controls without submitting a refund; verify a customer is denied owner routes. No claim is made that a dedicated admin orders page exists.

Phase 21B requires approved isolated staging data and authenticated sessions, HTTPS APP_URL/media domain, independently verified Cloudflare bucket isolation, production smoke, sandbox webhook, authenticated R2 download, Resend secret rotation/live email approval, deployed schedules, MongoDB replica-set tests, GST/legal approval, consultation policy and Atlas network restrictions. All external gates remain open. No deployment or Phase 22 work occurred.

## Task 2 Windows image failure follow-up - 24 November 2026

Owner real Chromium run of the extended suite: 9 tests, 7 PASS, 2 FAIL (the product-detail scenario and enclosing journey). Cart interactions, anonymous checkout safety and published catalogue API passed. The failing assertion in local-journey.test.mjs checked every document image once, immediately after the product heading rendered. The detail component can show a video with the thumbnail as a poster rather than an img, and a lazy image can still be loading then. This is a confirmed test selector/timing defect. The corrected suite targets the main product thumbnail or video poster, scrolls images into view, waits at most 10 seconds, checks natural dimensions only when a public asset is expected, and records sanitized host/path, completion, dimensions, observed HTTP status and browser load error on failure. A genuine missing/broken expected asset still fails. Actual owner image URL, response status and normal-browser rendering remain NOT_VERIFIED until rerun.

The category observation was also a test assumption: product categoryIds are IDs, while the public filter option values are slugs. The new separate category scenario resolves ID through the public active categories API and selects the slug. If the product has no active public category, that scenario SKIPS explicitly. The actual selected category status in the owner's database remains NOT_VERIFIED.

Agent E2E rerun BLOCKED at CDP Page.enable before navigation; no corrected image or category PASS claimed. Product media browser component fixture 1/1 PASS; TypeScript, focused ESLint and git diff --check PASS. Owner rerun: Set-Location D:\MoneyTreeVenture; set E2E_BASE_URL to http://localhost:3000; run node --test tests/e2e/local-journey.test.mjs. Share only sanitized image diagnostic and category skip/result if a failure remains. No application media configuration or R2 permissions changed.

## Task 3 authenticated local workflow - 24 November 2026

Owner confirms two separate real Chromium anonymous runs: 10/10 PASS and 10/10 PASS. These cover homepage, catalogue data/search/category, product media, cart, coupon feedback and anonymous checkout; do not treat them as authenticated checks.

Added tests/e2e/authenticated-local.mjs. It requires E2E_AUTHORIZED_TEST=true and E2E_AUTH_MODE=customer or admin, launches an interactive Chrome/Edge window with a fresh temporary profile, and waits for the owner to complete real Google sign-in. It never stores or prints cookies, credentials, user data or CDP endpoints. It checks anonymous purchase/admin API denial before sign-in, then the role's protected API and read-only customer pages (/account, /account/library, /account/orders, /account/bookings) or owner pages (/admin, products, categories, bookings, support, coupons). The owner signs out manually; the script checks that the session is invalidated, then closes and removes the temporary profile. It makes no purchase, edit, archive, download, refund or email request. No dedicated admin orders page exists; the dashboard explicitly says order operations are unavailable.

Agent execution: authenticated browser NOT_RUN because no approved signed-in development account/session is available here. The explicit test-mode guard was observed to deny an unapproved run. Syntax check PASS; owner authorization regression suite 19/19 PASS; application TypeScript, focused ESLint and diff check PASS. These are local source/mocked checks, not real signed-in browser results.

Owner command in PowerShell with a running local dev server: Set-Location D:\MoneyTreeVenture; set E2E_BASE_URL=http://localhost:3000, E2E_AUTHORIZED_TEST=true, E2E_AUTH_MODE=customer; run node tests/e2e/authenticated-local.mjs. Repeat with E2E_AUTH_MODE=admin using the genuinely authorized owner account in a fresh run. The window opens at /login; complete Google sign-in there, press Enter in terminal, inspect the read-only results, sign out in that browser, then press Enter again. Use only approved development accounts. Never copy an everyday browser profile.

MANUAL_REQUIRED with approved disposable records: customer-specific data and cross-customer denial (use two approved test accounts), pagination, order detail, archive/unarchive, Purchase Again and repeat-purchase review, legitimate/revoked/refunded PDF download bytes and private/no-store headers, consultation availability, owner form validation and refund controls without submitting refunds. Real Google callback, cross-origin CSRF and forged Host browser behavior, expiration and download authorization are NOT_VERIFIED until those controlled checks. Existing MOCKED authorization tests do not substitute for them. No new external launch gate closed.

## Task 3 authenticated harness correction - 24 November 2026

Owner Windows customer-mode command failed at authenticated-local.mjs Runtime.evaluate with the old generic Browser page check failed message, before any authenticated result. The stack points to the evaluate helper, not to a specific page expression. The first possible call was the anonymous purchase/admin API Promise.all immediately after Page.enable. The old helper discarded CDP exceptionDetails, so the exact browser exception and whether OAuth navigation contributed cannot be established from that run. No Better Auth or Google defect was confirmed.

The harness now explicitly navigates the selected local page to /login, waits for document.readyState complete on the intended localhost origin before the first fetch, and repeats bounded readiness checks after manual Google login, each protected navigation and manual sign-out. It treats an undefined CDP result as valid and retries only page-readiness checks when the execution context was destroyed during navigation. A new helper reports fixed operation labels, safe exception category/description, stage, context-loss flag and elapsed milliseconds. It never prints the evaluated expression, OAuth query, session object, cookies or tokens. The explicit authorized-test gate and temporary profile cleanup remain.

Harness unit tests 3/3 PASS (undefined value, navigation context loss and secret-safe errors); JavaScript syntax, TypeScript, focused ESLint and git diff --check PASS. Customer/admin actual browser modes and Google callback/logout remain NOT_RUN in this agent session because no approved signed-in test account is available. Original anonymous 10/10 Windows runs remain owner-verified. Owner rerun command: Set-Location D:\MoneyTreeVenture; set E2E_BASE_URL=http://localhost:3000, E2E_AUTHORIZED_TEST=true and E2E_AUTH_MODE=customer or admin; run node tests/e2e/authenticated-local.mjs. Use the opened temporary browser for real Google login; press Enter only after login is complete, then sign out and press Enter again. If it fails, share only fixed label/category/stage/contextLost/elapsedMs, not browser URLs or session data.

## P0 payment status synchronization — 24 November 2026

Two owner-reported sandbox orders remain locally PENDING while Cashfree dashboard shows FAILED and PAID. Authoritative provider attempts and local records have not yet been compared, so case-specific root causes and entitlement state are NOT_VERIFIED. Code confirms localhost has no public Cashfree notify_url; return and authenticated status endpoint reconcile, but Order History previously only read local state and scheduled maintenance only scanned expired orders. A closed return page or lost webhook could leave either state stale.

Added an authenticated single-order recovery check on order detail; Order History offers Check payment status for unresolved orders. Scheduled maintenance has a bounded pass behind PAYMENT_RECONCILIATION_ENABLED=true, independent of expiration. Existing Cashfree server verification, ownership, transactions, fulfillment, claims and outbox deduplication remain the write path. Cashfree GET calls now time out at 10 seconds. No payments or database writes were made.

Read-only two-order sandbox diagnostic: npm.cmd run payments:diagnose -- --confirm-database moneytreeventures --confirm-sandbox --dry-run-recovery --order-id <FIRST_24_HEX_ORDER_ID> --order-id <SECOND_24_HEX_ORDER_ID>. Actual comparison NOT_RUN because both selected IDs and a working sandbox connection were unavailable here. Owner approval is required before mutating recovery. Real webhook delivery, signed-in reconciliation, MongoDB transaction behavior and fulfillment for these orders remain NOT_VERIFIED. P0 launch blocker remains.


## Automatic payment and PDF status — 24 November 2026

Root cause of manual payment checks: checkout order detail mounted PaymentStatusCheck without autoCheck, and Order History had only an optional button. The return page auto-polled briefly, but a closed or missed return left server-rendered account data stale. A shared bounded browser poller now checks only visible pending orders, with four rounds at 0, 4, 12 and 30 seconds. It pauses while the tab is hidden, aborts on unmount, deduplicates order IDs and stops each order on paid or failed. Terminal results invoke router.refresh so Server Component account/order data updates. Temporary API errors retry within the bounded window and show feedback; the manual check remains. The status endpoint is authenticated and owner-scoped, and provider verification remains server-side.

Root cause of permanent Preparing PDF label: the library rendered pending personalized copies as if they were waiting for a background job, although the authenticated download endpoint generates a private personalized copy on demand. Pending and ready copies now offer Download; failed copies offer Retry. Preparing appears only during an actual authorized download; successful completion invokes router.refresh. No PDF bytes or private R2 URLs are fetched merely for readiness. Existing entitlement and refund checks remain on every download.

Background recovery: Netlify expire-orders schedule runs every 15 minutes, but previously returned early unless ORDER_EXPIRATION_ENABLED=true, making PAYMENT_RECONCILIATION_ENABLED ineffective alone. It now runs if either gate is true; the internal route independently gates expiration and reconciliation. Required runtime settings are PAYMENT_RECONCILIATION_ENABLED=true, ORDER_MAINTENANCE_DATABASE, APP_URL and OUTBOX_WORKER_SECRET in the appropriate Netlify Functions and app runtime scopes. Local .env.local name-only check found reconciliation and maintenance database unset; APP_URL and worker secret names present. Actual Netlify deployment/schedule is NOT_VERIFIED. A dry-run local inspection is available with npm.cmd run orders:maintain -- --confirm-database moneytreeventures --confirm-non-production --reconcile; it performs no provider reconciliation or writes. Any --apply run needs owner authorization and a disposable test order.

Focused MOCKED/pure tests: polling/PDF/fulfillment 21/21 PASS; Netlify worker 5/5 PASS; browser component fixture 1/1 PASS; application TypeScript, test/CLI compilation, focused ESLint and diff check PASS. Real Google-signed-in browser, Cashfree sandbox return, Netlify schedule, R2 PDF generation and the two historical inconsistent orders remain NOT_VERIFIED. P0 blocker stays open.

Scheduled reconciliation is additionally capped at one order per 15-minute invocation to stay within the protected worker request budget; its cursor advances across eligible orders.

## Targeted expired/failed sandbox recovery — 24 November 2026

Owner read-only diagnostic confirmed order 6b04e305b88c9c755bce8429 is already PAID locally and at Cashfree, with one successful attempt, one purchase, zero active claims and one confirmation outbox event. No mutation is required. The diagnostic's prior unresolved label was misleading; verified already-paid evidence now reports already_paid.

Owner diagnostic confirmed order 6b0341108ffd602387cde275 has Cashfree order EXPIRED and one FAILED payment attempt with matching identity and amount; local order remains awaiting_payment/pending with one active claim, no purchase and no confirmation event. The existing recordVerifiedPaymentStatus service can record the failed attempt; expireOrderIfSettled can then atomically set orderStatus expired, release the active checkout claim and coupon reservation if present, and create an audit event. Order History keeps failed/expired orders in the closed tab; verified late success remains supported by the existing late-success path. The command is restricted to this exact order and sandbox database, defaults to read-only, refetches all current provider attempts twice before any write, checks local revision and rejects ambiguous or successful evidence. Apply requires both --apply and --owner-approved-apply. No database mutation was performed here.

Agent read-only dry-run attempted with the guarded command but could not connect: sanitized mongodb.connection.initial_failure ETIMEOUT / dns_srv after 42.5 seconds. Thus current provider evidence, local expiration timestamp and guarded apply path were NOT_VERIFIED in this environment. Owner PowerShell dry-run: npm.cmd run payments:recover-expired -- --confirm-database moneytreeventures --confirm-sandbox --confirm-non-production --order-id 6b0341108ffd602387cde275 --dry-run. Do not run apply until dry-run returns eligible and owner explicitly approves after reviewing the exact before state. The prepared apply mode reuses recordVerifiedPaymentStatus and expireOrderIfSettled, but real DB transaction execution is NOT_TESTED here.

Focused tests 63 PASS, 1 SKIP (disposable MongoDB replica set unavailable); TypeScript application, test and admin CLI compilation, focused ESLint and diff check PASS. Historical Order 2 remains stale PENDING until an approved recovery succeeds. P0 blocker remains.


## Automatic terminal failure and safe retry — 24 November 2026

Owner Windows dry-run for sandbox order 6b0341108ffd602387cde275 returned eligible, but no apply was performed. Order 6b04e305b88c9c755bce8429 remains already PAID with one purchase; do not mutate it. Root cause: getVerifiedPaymentStatus synchronized a FAILED provider attempt but did not invoke expireOrderIfSettled after conclusively terminal provider evidence. The status endpoint could therefore return failed while the order stayed awaiting_payment with an active claim. A provider EXPIRED order with zero payment attempts also left the local attempt pending indefinitely.

The existing server verification now requires every fetched Cashfree order to be EXPIRED, correctly associated and amount/currency matched, with no SUCCESS or unresolved attempt. It records failed attempts through recordVerifiedPaymentStatus, closes verified expired orders with no payment attempts in a narrow transaction, then invokes expireOrderIfSettled. That existing transaction marks the local order expired, releases active claims and eligible coupon reservations, and audits the transition. Late verified SUCCESS remains eligible for the existing late-success reconciliation path; uncertain provider evidence leaves claims intact. The payment-initiation service now rejects a failed or expired old order and only reuses the same pending attempt idempotently.

After terminal expired/failed status, return, order detail and Order History show a deliberate Try Payment Again action. It first invokes the authenticated owner-scoped status endpoint. Only a still expired/failed order can restore its public product IDs to an empty cart; it then navigates to the existing checkout flow, which recalculates prices and rechecks ownership/Purchase Again and active claims. It never opens Cashfree automatically. Pending or provider-unavailable status blocks retry. Manual Refresh Status remains available. The failed original remains visible in Order History.

Scheduled reconciliation now selects the configured Cashfree environment instead of sandbox only. Netlify invokes the protected endpoint every 15 minutes only when PAYMENT_RECONCILIATION_ENABLED or ORDER_EXPIRATION_ENABLED is true; app reconciliation is independently gated and processes one order per invocation with a persisted cursor. The cursor should progress past unresolved candidates; real multi-order scheduler execution remains NOT_VERIFIED. Local name-only check previously found PAYMENT_RECONCILIATION_ENABLED and ORDER_MAINTENANCE_DATABASE missing. Netlify runtime setting, webhook delivery and production payment behavior remain NOT_VERIFIED; no configuration was activated.

Focused mocked/pure order/payment/fulfillment tests 67 PASS, 1 SKIP (MONGODB_TEST_URI absent); Netlify 5/5 and Chromium component 2/2 PASS. Application TypeScript, test/CLI compilation, focused ESLint and diff check PASS. Real transaction/claim-release, concurrent retries, signed-in browser retry and Cashfree sandbox payment remain NOT_VERIFIED. The historical order is still stale until owner-approved recovery succeeds. Prepared guarded apply command after a fresh eligible dry-run and explicit owner approval: npm.cmd run payments:recover-expired -- --confirm-database moneytreeventures --confirm-sandbox --confirm-non-production --order-id 6b0341108ffd602387cde275 --apply --owner-approved-apply. It was NOT run here. P0 remains open.

The internal scheduled handler now skips disabled expiration or reconciliation modes entirely, so a disabled mode cannot require the other mode configuration or scan the database.
The specifically diagnosed historical order 6b0341108ffd602387cde275 has a temporary automatic-status-recovery hold while it remains awaiting_payment; ordinary new orders use automatic finalization. The guarded owner-approved recovery command bypasses this hold through existing verified lifecycle services. Remove the hold only after approved recovery and verification; signed provider webhook handling remains intact.

## Post-payment confirmation page — 24 November 2026

Dedicated route: /checkout/return. Cashfree receives the configured return URL with the current Cashfree order_id inserted using URLSearchParams.set, preserving other configured parameters and preventing duplicate order_id values. On return the server requires the signed-in customer, maps provider order ID only to a Payment owned by that customer, and queries the existing Cashfree verification/reconciliation service. Browser redirect parameters never assert success. Missing session goes through the existing login route; missing/foreign mapping reveals no order details.

Client result screen supports only server-authoritative states: success (order/payment both paid), failure (order expired and payment failed), and processing otherwise. It automatically polls the existing owner-scoped status endpoint, uses bounded backoff, pauses while hidden, aborts on unmount, and transitions state in React without a full reload. Displays authoritative order snapshot amount, reference, products and bundle contents. PDF purchases link to My Library; consultation purchases link to bookings; mixed purchases show both. Processing state has no retry action. Failed state reuses the deliberate retry component, which rechecks status before restoring product IDs to the normal repricing checkout. Success shows no payment retry and explains secure on-demand PDF generation rather than claiming a personalized copy is already prepared.

Focused MOCKED/pure payment and result tests: 31/31 PASS including return URL parameter handling, state classification, resource destination selection, bounded polling and hidden-tab/unmount behavior. Application and test TypeScript, focused ESLint and git diff --check PASS. No real payment or browser/provider integration was run. Owner should complete a sandbox payment in the authenticated browser, verify automatic result transition, confirm My Library/booking links, and refresh/back-forward behavior. The existing historical stale order remains a P0 until its approved guarded recovery completes.


## Cashfree Create Order timeout follow-up - 24 November 2026

The 20-second POST timeout, stable stored provider order ID and idempotency key, and client Pay Now guard remain in place. A lost Create Order response could previously leave a provider order without a usable local session; a retry repeated the same POST but did not inspect an existing provider order. Initiation now performs a read-only Get Order after a Create Order failure and opens checkout only when provider ID, integer-paise amount, INR currency, ACTIVE status and nonempty payment session match the stored attempt. If lookup fails, the original error is retained; later retries reuse the same local payment attempt, provider order ID, idempotency key and request hash. A mismatched or unusable provider order fails closed.

The read-only payments:diagnose CLI accepts --single-initiation-order only for order 6b0505cd97e9bf0ea159f184. It reports sanitized local status, attempt count, provider-ID presence, initiation-error category, claim counts, sandbox order/payment statuses, session presence and identity/amount/currency checks. Agent execution stopped at MongoDB DNS SRV ETIMEOUT after 54,471 ms, before reading the order or calling Cashfree. Order-specific provider state and actual Create Order behavior are NOT_VERIFIED. Owner Windows command: npm.cmd run payments:diagnose -- --confirm-database moneytreeventures --confirm-sandbox --dry-run-recovery --single-initiation-order --order-id 6b0505cd97e9bf0ea159f184.

Focused mocked Cashfree tests 27/27 PASS. Application TypeScript, test TypeScript, admin CLI compilation, focused ESLint and git diff --check PASS. No payment, database mutation, migration or deployment occurred. Manual next step: run the read-only command in the owner's working Windows environment and review the sanitized result before retrying this order in an authenticated sandbox browser. A timeout does not prove Cashfree received nothing.

## Phase 21 final QA and handoff checkpoint - 24 November 2026

Evidence: the owner reports normal-Chrome Cashfree sandbox checkout now opens and previously ran anonymous Chromium E2E 10/10 twice on Windows. The owner also checked 390px, 768px and 1440px light/dark layouts. These are owner-reported observations, not proof of paid fulfillment. This agent's anonymous E2E again stopped at CDP Page.enable (0/1); it did not reach the application. No authenticated browser, new provider POST, refund, email send or database mutation was performed.

Focused regression after correcting three stale assertions and one browser fixture: payments 65/65, checkout 40/40, fulfillment plus outbox 35/35, auth plus admin dashboard 42/42, catalogue 83/83, cart/coupon 10/10, scheduled worker 5/5, browser component 3/3, integration 1 PASS and 4 SKIP (no MONGODB_TEST_URI). Total 284 PASS, 4 SKIP; agent anonymous E2E 0/1 due Page.enable. Application and test TypeScript, admin CLI compilation, focused ESLint and diff check PASS. The test corrections only updated expectations for English configuration text, AccountShell logout placement, safe pre-retry wording and the hosted-checkout useRef fixture. They did not change application behavior.

Customer journey status (PASS below is owner-reported anonymous Windows automation unless explicitly marked otherwise):

| # | Journey | Status and limit |
|---|---|---|
| 1 | Homepage/catalogue | PASS - owner anonymous 10/10 suite. |
| 2 | Search/category/product detail and media | PASS - owner anonymous 10/10 after prior test correction; actual asset coverage depends on selected fixture. |
| 3 | Add/remove cart, persistence, empty state | PASS - owner anonymous suite. |
| 4 | Multiple PDF products | BLOCKED - no approved multi-PDF fixture. |
| 5 | Invalid/valid coupon | Invalid feedback PASS in owner suite; valid coupon MANUAL_REQUIRED with approved fixture. |
| 6 | Anonymous checkout gate | PASS - owner suite checks Google prompt; mocked API authorization also passes. |
| 7 | Google sign-in | MANUAL_REQUIRED in normal Chrome; automated Google login is restricted. |
| 8 | Create order/open Cashfree sandbox | PASS only for owner-reported checkout opening; order identity and payment outcome for that attempt remain unverified here. |
| 9 | Verified successful payment | MANUAL_REQUIRED - do not infer PAID from checkout opening. |
| 10 | Success confirmation screen | MANUAL_REQUIRED; mocked/pure UI tests PASS. |
| 11 | Automatic Order History update | MANUAL_REQUIRED; bounded polling tests PASS. |
| 12 | Purchased PDF in My Library | MANUAL_REQUIRED; entitlement policy tests PASS. |
| 13 | Authorized real PDF download | MANUAL_REQUIRED; mocked byte/ownership tests PASS. |
| 14 | Real PDF watermark | MANUAL_REQUIRED; PDF fixture tests PASS without email watermark. |
| 15 | Verified unsuccessful sandbox attempt | MANUAL_REQUIRED; avoid unnecessary new attempts. |
| 16 | Failure/expiry confirmation screen | MANUAL_REQUIRED; presentation tests PASS. |
| 17 | Safe Try Payment Again | MANUAL_REQUIRED; policy/component tests PASS. |
| 18 | No premature retry while unresolved | MOCKED/pure PASS; real provider transition MANUAL_REQUIRED. |
| 19 | Intentional Purchase Again | MANUAL_REQUIRED; checkout policy tests PASS. |
| 20 | Separate purchase records, one library card | MOCKED/pure PASS; real repeat-payment/database check NOT_RUN. |
| 21 | Consultation booking and history | MANUAL_REQUIRED; booking/API tests PASS. |
| 22 | Logout and protected routes | MANUAL_REQUIRED; mocked auth/admin tests PASS. |

Customer/admin authorization: owner-scoped order, PDF and booking APIs, private-note omission, admin gate, refund gate and archive/unarchive route contracts passed focused mocked/pure tests. Source archive uses only $set/$unset on archivedAt. Actual cross-account browser isolation, real archive restoration, owner admin navigation and logout session invalidation are MANUAL_REQUIRED. Do not forge cookies or promote test accounts.

Payment and fulfillment integrity: source continues to price from stored INR order snapshots, validate provider order/payment ID and exact amount before PAID, use transaction-based paid fulfillment and order-scoped outbox deduplication, keep one pending payment attempt and stable provider order/idempotency key, distinguish attempt failure from terminal order failure, preserve late verified success, and release claims only after conclusive terminal evidence. Scheduled reconciliation has an independent feature gate and bounded cursor; PDF and Call Guidance entitlements remain separate. These are source/mocked-test findings, not live integration proof. Existing paid order 6b04e305b88c9c755bce8429 remains historically verified PAID with one purchase and one outbox event; no new check was needed. Previously timed-out order 6b0505cd97e9bf0ea159f184 was previously reported as matching ACTIVE with a session; its PAID state is NOT_VERIFIED. Historical expired order 6b0341108ffd602387cde275 has no supplied approved apply result. A new guarded read-only dry-run failed before DB access with DNS SRV ETIMEOUT after 49,534 ms, so its final state remains NOT_VERIFIED. Do not mutate either historical order without separate authorization.

PDF and communications: mocked/pure tests cover post-payment entitlement, owner-bound download, private response headers, generated PDF bytes, on-demand pending copy, failed-copy Retry, watermark with customer/order reference and no email, private key generation, one confirmation per order, outbox deduplication/retry and booking events. Real R2 access, actual private/public bucket settings, real download/watermark and Resend delivery remain NOT_VERIFIED. Cloudflare public/private bucket mapping is a critical staging gate. MONGODB_TEST_URI, PAYMENT_RECONCILIATION_ENABLED and ORDER_MAINTENANCE_DATABASE are absent by name in local .env.local; real claim concurrency and scheduled recovery are NOT_RUN/NOT_VERIFIED. Do not enable live jobs or send mail during QA.

Owner normal-Chrome checklist: (1) On an existing approved sandbox paid order, open /checkout/return, confirm server-verified PAID and exact amount/reference, then check Order History, My Library and one authorized PDF download/watermark. (2) Reuse an existing failed/expired sandbox order to confirm terminal failure, claim release and deliberate retry; if still unresolved, verify retry remains blocked. (3) For an already-owned PDF, verify affirmative Purchase Again, separate order history and one library card; only make a new sandbox payment if specifically needed and approved. (4) Check consultation booking entry/history, then customer order/library navigation. (5) Sign in as the verified owner in normal Chrome and check owner-only admin sections; use a normal customer account to confirm denial, archive/unarchive and private-note isolation. (6) Sign out and confirm account, PDF and admin routes require a fresh session. Record only statuses and sanitized request IDs, not tokens or customer data.

Phase 22 staging entry: Category A blockers are unverified public/private R2 isolation, missing staging credentials, approved HTTPS APP_URL/media origin, production runtime startup under those values, and any critical payment integrity defect. Category B checks require staging and must not be falsely demanded before it exists: public Cashfree webhook, Netlify schedules, deployed headers, real transactional email, production-like auth and deployed private PDF access. Category C commercial launch blockers remain GST/tax policy, legal seller identity and approved policy/contact/grievance text, Resend secret rotation, restricted Atlas access, consultation cancellation/rescheduling policy and any unresolved payment/entitlement issue. A previous 53/53 build is not deployment evidence.

Recommendation: Phase 21 source/test handoff is complete, but final customer QA remains BLOCKED by owner manual signed-in payment-to-PDF and failure/retry evidence, the unresolved historical expired order, real concurrency, and Category A staging configuration. Do not start Phase 22 or claim public-launch readiness from this checkpoint.
