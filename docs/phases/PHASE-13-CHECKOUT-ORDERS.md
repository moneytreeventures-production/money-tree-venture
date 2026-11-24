# Phase 13 — Secure checkout, orders, and payment consistency

## Scope and implementation

Phase 13 hardens the existing checkout and Cashfree order lifecycle without replacing the cart, order model, payment provider, authentication, or fulfillment architecture.

- Order creation continues to require an authenticated customer and recomputes prices from currently published products, active private PDF assets, applicable coupon rules, and server tax configuration. Client prices and discounts are rejected. Amounts are integer paise and currency is INR.
- Order line, price, tax, coupon, currency, and gateway snapshots are immutable at the Mongoose schema boundary. The order's `createdAt` timestamp is the creation/snapshot time. Customer order views expose only safe snapshot fields and only expose Call Guidance fulfillment instructions after verified payment.
- Call Guidance quantity is limited to one because fulfillment creates one booking for each order line. Checkout and coupon preview enforce the same rule; cart controls reflect it.
- The existing checkout idempotency key remains in use. Payment creation reuses an unresolved pending Cashfree attempt only when its canonical request hash matches. A different request cannot silently create another attempt while the earlier one is unresolved.
- Provider payment status is verified server-side; a browser return is not proof of payment. Provider state classification is case-insensitive and unknown states do not become success. Authenticated order status refresh is customer-scoped.
- An order is finalized as expired only after its payment window has passed, it has no pending payment attempt, and its payment is not pending or paid. The transaction releases a still-reserved coupon and writes an audit event. A later verified success is honored once, restores a released coupon redemption, and emits a reconciliation audit if reservation capacity may have been reused. No automatic refund is issued.
- Late provider success does not downgrade an already paid/refund-locked order. Existing duplicate payment IDs and callback processing remain idempotent through the current models and transaction flow.

## Verification

Local checks completed on 2026-11-21:

- `npm.cmd run test:checkout`: **27/27 PASS** (cart, canonical coupon preview, checkout pricing, order API/idempotency, quantity and expiry rules).
- `npm.cmd run test:providers`: **39/39 PASS** (Cashfree client/webhook/payment API, status auth, and provider tests).
- `npm.cmd run test:models`: **14/14 PASS**, including immutable order snapshot schema checks.
- `npm.cmd run test:auth`: **21/21 PASS**.
- `npm.cmd run test:browser`: **6/6 PASS**. These are rendered component fixtures for cart quote freshness and payment status controls; they do not prove a real authenticated browser journey.
- `node_modules\\.bin\\tsc.cmd --noEmit --incremental false`: **PASS**.
- `npm.cmd run lint`: **PASS**.
- Isolated `npm.cmd run build`: **PASS** using process-only `PUBLIC_MEDIA_BASE_URL=https://media.example.com` and dummy unreachable localhost MongoDB settings. Two sanitized admin database request errors occurred during prerender; no database was verified. `.env.local` was not changed.
- `npm.cmd run test:smoke` with the same process-only overrides: **FAIL / NOT_VERIFIED**, first request timed out. No production route smoke is claimed.
- Transaction/concurrent reservation behavior, real owner/customer sessions, Cashfree sandbox payments, and provider callback ordering are **NOT_VERIFIED**.

## Deferred verification and Phase 14 dependencies

Use an owner-approved disposable MongoDB replica set and Cashfree sandbox. Verify transaction rollback, simultaneous coupon reservation limits, expiration versus a pending provider attempt, idempotent duplicate and out-of-order signed callbacks, successful/failed/pending/cancelled sandbox payments, and late success after expiry. Include explicit reconciliation review for duplicate provider successes and a late coupon redemption whose capacity was reused. Then run authenticated customer and owner browser flows against that disposable environment. No live payment, refund, production database, deployment, or production data operation was performed.

Existing production `r2.dev` media URL validation still blocks an ordinary production build. Keep that configuration blocker open and resolve it only through an owner-approved production configuration task.

Phase 13 implementation is **locally implemented and partially verified**. Phase 14 has not started.

## Targeted POST /api/orders 409 correction - 2026-11-21

The owner's authenticated local click returned 409 with the old generic `CONFLICT` message, but the response body/request ID and a sanitized server branch log were not available. Source shows three direct 409 branches: reused idempotency key with a different request hash; MongoDB duplicate key with no matching same-request order; and a transaction that returned without a created order. A same-key/same-hash pending order is returned as the existing order, not rejected. The precise owner branch remains NOT_VERIFIED.

Order creation now returns distinct safe codes: `ORDER_RETRY_MISMATCH`, `ORDER_CREATE_COLLISION`, and `ORDER_CREATION_INCOMPLETE`. A mismatch clears only the matching browser checkout key and asks the customer to review and manually retry; rapid repeated Review clicks are blocked synchronously. No automatic new order is submitted. Coupon/product errors display specific English guidance. Product prices, coupon restrictions, transaction boundaries and authorization remain unchanged.

Local verification: `test:checkout` 29/29 PASS, checkout component interaction fixture 1/1 PASS, TypeScript and focused ESLint PASS. No real MongoDB write or Cashfree call was performed. To identify the owner's original branch, inspect only the failing `/api/orders` response's `error.code`, `error.details[].field` and `requestId` in DevTools; omit cookies, customer/cart data and headers. Repeat checkout after the code update and report the new code if 409 persists.

Owner follow-up supplied the original response: `error.code=CONFLICT`, no `error.details`, with a request ID. The old response shape cannot distinguish the three source branches, and no branch-specific order log was available for that ID. The reported 409 remains a confirmed runtime symptom; its precise branch is not confirmed by this evidence. The new branch-specific codes must be observed after running the updated code to complete diagnosis.

The owner then retried with the updated code and received `ORDER_CREATE_COLLISION` (not `ORDER_RETRY_MISMATCH`). This confirms a MongoDB duplicate-key error for which the same customer/idempotency key lookup found no matching order. The conflicting unique index is not yet known. A read-only metadata connection from this execution environment failed with `ECONNREFUSED`; no records were read or changed. A sanitized server log now emits only the duplicate key's `indexFields` names for the next attempt, without values. Do not drop an index or alter orders until those fields are known.

### Confirmed legacy order index cause and prepared correction

Owner-local server diagnostics for a renewed `ORDER_CREATE_COLLISION` show `indexFields=["orderNumber"]`. The active Order model has `orderReference` and no `orderNumber` field. The obsolete unique single-field `orderNumber` index rejects new order inserts without that field; the same-key order lookup finds no matching order, so the service correctly reports `ORDER_CREATE_COLLISION`. This is confirmed by the owner-local runtime index-field diagnostic. No real order record was changed.

`scripts/initialize-indexes.ts` now supports a narrowly guarded non-production migration. It matches only a unique, non-partial, single-field `{ orderNumber: 1 }` index, first creates current Order model indexes, and then drops only the matched obsolete index. It requires `--confirm-database <exact-name> --drop-legacy-order-number-index --confirm-non-production`. Other index modes retain their prior behavior. Index migration was NOT_APPLIED: this execution environment's read-only connection returned `ECONNREFUSED`. The owner must run the command in the local environment that reaches the confirmed non-production database, then retry Review order. The command does not modify order records or start Cashfree.

Focused index tests 4/4 PASS; TypeScript and focused ESLint PASS. The prior checkout tests 29/29 and component interaction 1/1 passed. Real order creation after index removal and Cashfree sandbox initiation remain NOT_VERIFIED.
