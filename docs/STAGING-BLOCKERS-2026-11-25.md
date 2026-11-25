# Staging outbox and repurchase blockers - 25 November 2026

Branch confirmed staging. Existing .env.example and package.json edits preserved.

Outbox: HTTP 401 alone does not establish secret mismatch. Application returns UNAUTHORIZED / Worker authorization required only before claiming any event. Pending attemptCount=0 is consistent with that boundary, but Netlify protection or redirects remain possible. No repository middleware/proxy was found. Scheduled fetch previously followed redirects and hid response provenance. It now refuses redirects and reports only redirect_blocked, application_worker_auth_rejected, or unclassified_response. Constant-time secret checking remains; bare secrets and Basic headers are now rejected. APP_URL custom HTTPS origin is appropriate if it resolves directly to this app; no unverified internal endpoint was introduced.

Owner Netlify checks: Project configuration > Environment variables, inspect APP_URL and OUTBOX_WORKER_SECRET in the live/production deploy context used by the published staging branch, including Functions scope and branch overrides. Compare the Live app configuration with the deployed Version's configuration privately. Set APP_URL to https://staging.moneytreeventure.com and use the same owner-managed worker credential in scheduler and application runtime. Check domain redirects and request protection. Do not assume an environment edit updated an already published version. One coordinated deployment is needed for these code changes and any corrected deployment variables, after owner approval. Do not invoke the outbox until approved to send queued mail.

Outbox behavior: pending/retry entries are atomically claimed as processing with attemptCount incremented; stale processing claims can be reclaimed after five minutes. Sent is recorded after provider success; exceptions move to retry or dead_letter. Existing events use their stable dedupe key for Resend idempotency. No new order is needed to process pending confirmations. Real delivery, database transitions, and provider idempotency are not verified by local tests.

Repurchase: the reported error means the checkout index gate failed (missing history index or remaining legacy constraint); exact live metadata is unknown. Required purchases indexes: purchase_user_product_history {userId:1,productId:1,grantedAt:-1}, nonunique, no partial filter/sparse; purchase_order_line_unique {orderLineId:1}, unique, no partial filter/sparse. Recognized obsolete constraints include purchase_one_active_product_per_user and historical user_1_product_1. checkoutClaims must retain checkout_claim_one_active_product {userId:1,productId:1}, unique with partialFilterExpression {status:active}.

Migration safety tightened: configured database must match confirmation before connecting, in addition to actual connected-name verification. Both replacement purchase indexes are now inspected before any legacy index removal. Existing duplicate/missing-line checks and active-claim prerequisite remain. No documents are modified by this migration.

Local target-name check confirmed moneytreeventures_staging without printing credentials. Read-only preflight failed at DNS SRV ETIMEOUT after 51,495 ms, before metadata or records could be read. No successful migration or record-preservation integration result is claimed.

Owner read-only command (use staging-only credentials; no production URI):

```powershell
npm.cmd run db:indexes -- --confirm-database moneytreeventures_staging --repurchase-indexes-only --confirm-non-production --preflight-only
```

Only after reviewing preflight and explicit owner approval, the modifying command is:

```powershell
npm.cmd run db:indexes -- --confirm-database moneytreeventures_staging --repurchase-indexes-only --confirm-non-production
```

Then rerun the read-only preflight to verify final definitions. Migration creates/verifies replacement indexes, checks active claims, removes only approved legacy index definitions and verifies final state; no purchase/order/claim documents are deleted or changed. No migration was executed here.

Validation: worker tests 6/6 PASS; index/outbox tests 20/20 PASS; checkout/purchase tests 35/35 PASS in the earlier combined run. Application/test TypeScript, admin CLI compilation and focused ESLint PASS. These are mocked/pure checks, not live cross-customer, concurrency or email verification. Staging 401 cause and index metadata remain blocked pending deployed diagnostics and owner read-only preflight. No deployment, provider payment, email send, production connection or database migration performed.
