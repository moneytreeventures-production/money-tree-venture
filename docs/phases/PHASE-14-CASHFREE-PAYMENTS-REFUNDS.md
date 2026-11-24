# Phase 14 — Cashfree sandbox payment verification and reconciliation

Checkpoint: 2026-11-22. This is a non-production verification record. No deployment, new payment, refund, or production database operation was performed.

## Outcome

Two existing Cashfree sandbox attempts were checked using provider GET requests. Both provider orders reported `PAID` and each had a matching `SUCCESS` payment in INR for the stored order amount. The local `moneytreeventures` database still showed both as pending before reconciliation. The application reconciler then updated both local orders and payment attempts to paid/success without changing their amount or currency.

The initial order-status reconciliation exposed an actual Mongoose failure: saving hydrated Order and Payment documents after mutating lifecycle state raised `StrictModeError` on immutable financial paths (`discountPaise`, `taxPaise`, `currency` on Order; `currency` on Payment). This aborted reconciliation and left the local return flow pending. A later second payment reconciliation exposed the active-purchase unique index: both paid attempts were for the same customer/product. The first had already created the active entitlement, so a second purchase could not be inserted.

## Corrections

- Lifecycle transitions now use narrowly scoped conditional updates with expected prior state, transaction session, and update validators. Financial snapshot fields are excluded from update payloads. Order expiry and refund order-state transitions use the same helper.
- Payment lifecycle updates use an expected-state conditional update in the same transaction. Provider status and amount/currency checks remain authoritative; pending or uncertain results do not become paid.
- If an active entitlement for the same customer and product already exists, fulfillment preserves it, records an audit event, and avoids inserting a duplicate purchase. No automatic refund is issued.
- The return page performs bounded verification retries and offers an explicit status check plus View Order, My Account, and Home links. Unknown/pending states remain explicit. The order detail does not offer a new attempt while the current payment remains unresolved.
- Cashfree `notify_url` is derived from a public HTTPS return URL. Localhost URLs do not generate a webhook URL because Cashfree cannot deliver to localhost.

## Webhooks and refunds

The existing webhook path verifies the exact raw body and Cashfree signature, enforces bounded request bodies, and handles event idempotency. A signed synthetic success, duplicate delivery, and out-of-order failure sequence was processed against the development database. The verified success reconciled; duplicate delivery was ignored; the later failure did not downgrade paid state. This inserted two **synthetic** webhook-event records in the development database. It is not evidence of a Cashfree webhook delivery.

No public HTTPS webhook URL or Cashfree dashboard event configuration was available to verify. Before relying on webhooks in sandbox, configure the deployed/staging HTTPS endpoint `https://<public-host>/api/webhooks/cashfree` and enable the relevant payment status events in Cashfree; then confirm delivery and signature acceptance. Do not use a localhost URL.

Refund source inspection confirms owner-admin authorization at the route, full-order refund amount from the stored order, environment/payment identity matching, idempotency, provider GET verification, and entitlement revocation only after provider `SUCCESS`. The refund path also requires one successful payment and limits the request to paid orders within six months. No refund was requested or tested against Cashfree.

## Verification

- Actual Cashfree sandbox GETs: both existing attempts matched provider order ID, INR amount, and `SUCCESS` payment. No Cashfree create-payment or refund request was made.
- Actual development MongoDB reconciliation: both orders/payment records moved from pending to paid/success. The first created one purchase; the second reused the already-active entitlement and did not create a duplicate. Amount/currency remained unchanged.
- Signed synthetic webhook fixture against development MongoDB: success, duplicate delivery, and out-of-order failure behavior passed; not a real webhook delivery.
- Automated focused checks: models 17/17, providers 44/44, checkout 29/29, payment-status browser component 1/1; TypeScript and focused ESLint passed.
- Actual authenticated customer browser session, actual Cashfree webhook delivery, refund operation, and public HTTPS endpoint configuration: **NOT VERIFIED**.
- No production build was run. Existing production media URL validation remains an unrelated build limitation.

## Remaining work

Configure and verify the sandbox webhook on a public HTTPS staging endpoint, then perform authenticated customer return/order checks. No fresh payment is needed to inspect the two already-paid development orders. Do not mark refund or real webhook delivery verified from synthetic fixtures. Phase 15 must not be treated as having started.


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
