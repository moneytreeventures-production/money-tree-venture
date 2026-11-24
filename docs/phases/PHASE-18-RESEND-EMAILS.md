# Phase 18 — Transactional Email Follow-up

## Completed in this follow-up

- Moved the purchase-confirmation outbox trigger from each PDF entitlement to the verified order fulfillment boundary. It now writes at most one `purchase_confirmation` event per order in the existing fulfillment transaction, using `purchase-confirmation:<orderId>` as the unique deduplication key.
- The confirmation is built from the immutable order snapshot and lists every purchased line, quantity, line total, and the stored order total. The sender ignores legacy per-entitlement confirmation events so queued historical events cannot send one email per PDF.
- Replaced non-English wording in purchase, consultation-booking, and refund email templates. Booking request, scheduled-but-not-confirmed, confirmed, completed, and cancelled wording remains distinct. Existing Resend delivery and idempotency behavior is unchanged.

## Verification

Focused fulfillment/outbox suite: 28/28 passed; scheduled email handler tests: 2/2 passed. The outbox tests cover multiple products in one order, English copy, HTML escaping, INR amounts, and requested/scheduled/confirmed booking wording. TypeScript passed; focused ESLint passed; `git diff --check` passed (only existing working-tree line-ending notices). No email was sent and no live Resend call, database write, payment, or deployment was performed.

## Remaining

An authenticated end-to-end paid-order/outbox delivery check against a disposable database and Resend sandbox remains unperformed. Existing legacy per-entitlement events are skipped if still queued; previously sent historical emails cannot be recalled.

## Final integration readiness check (2026-11-22)

Implementation status: COMPLETE. Live transactional email delivery remains NOT_VERIFIED.

- Local environment inspection reports `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, and `OUTBOX_WORKER_SECRET` present. Values were not printed. The configured local APP_URL uses HTTP localhost, not a public HTTPS origin. Presence does not validate the Resend key or sender.
- A read-only Resend domain-status request could not reach the provider from this execution environment (`TypeError`); sender/domain verification is NOT_VERIFIED and must be checked by the owner in Resend.
- Netlify source declares the `process-outbox` schedule every 15 minutes. The function requires APP_URL and OUTBOX_WORKER_SECRET and calls the authenticated internal endpoint with a bounded batch. Live Netlify schedule activation and deployed environment values are NOT_VERIFIED.
- The outbox schema declares `outbox_dedupe_key_unique` on `dedupeKey` with a unique partial string filter. The model test validates the declaration. Read-only `listIndexes` against the configured development database did not complete in this environment, so actual database index presence/options are NOT_VERIFIED.
- Paid order events are created inside verified fulfillment and the worker only dispatches the supported outbox event types; Resend receives the event dedupe key for provider idempotency. Booking requests originate at paid fulfillment; later status notifications originate from booking transitions/refund lifecycle. No email was sent.

Final non-sending checks: `npm.cmd run test:fulfillment` PASS (30/30 plus scheduled handler 2/2); `npm.cmd run test:models` PASS (17/17); TypeScript PASS; focused ESLint PASS; `git diff --check` PASS. Tests cover event key stability, multi-product English rendering, no private PDF URL content, Resend request construction without fetch, retry backoff, and model-declared indexes. No live provider request succeeded, no real email, database write, payment, or deployment occurred.

Owner actions before a controlled delivery: verify the sender domain and sender identity in Resend; configure a public HTTPS APP_URL and matching worker secret in the application and Netlify environments; independently confirm the outbox index with read-only `listIndexes`; confirm the Netlify schedule is deployed/enabled. After those checks and separate authorization, send exactly one test to an owner-approved inbox. Do not replay historical customer orders.

Security prerequisite: a prior diagnostic search inadvertently emitted `.env.local` values into tool output. Rotate `RESEND_API_KEY` and `OUTBOX_WORKER_SECRET` before enabling or testing delivery. No values are repeated; no rotation was performed.
