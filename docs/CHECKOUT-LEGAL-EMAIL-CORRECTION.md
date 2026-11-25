# Checkout, legal and email correction — 25 November 2026

## New-order pricing

New orders no longer require `TAX_RATE_BPS`. The order service passes a zero rate to the existing integer-paise coupon allocator and stores `taxPaise: 0` with a `no-tax-v1` compatibility snapshot. Cashfree still uses the server-verified stored order total. Existing immutable order and refund amounts remain unchanged, and the snapshot validator still accepts historical inclusive-tax records. Cart, checkout entry, product detail and new-order checkout summary no longer present an applicable-tax line or warning. Historical orders with recorded tax retain a conditional display of the stored amount.

This pricing decision is not a legal tax determination. The billing page retains the owner's current declaration and the need for qualified review. The approved finalized Terms, Privacy, Refund/Cancellation and Digital Delivery text was not present in the repository or attached to this request. Draft notices remain until the client supplies that text; no legal claim was invented.

## Email test 403 and outbox 401

The local GET returned a generic 403 for any error, and the health service required the staging database. The GET now distinguishes a missing owner session (401), lack of owner authorization (403), wrong environment (403), and a health/read failure (503). Read-only owner diagnostics may use the existing `moneytreeventures` database. Sending locally requires `EMAIL_TESTING_ENABLED=true`, matching HTTP localhost `APP_URL` and `BETTER_AUTH_URL`, `NODE_ENV=development`, `MONGODB_DB_NAME=EMAIL_TEST_DATABASE_NAME=moneytreeventures`, and the explicit `EMAIL_TEST_DATABASE_ROLE=local-development-only` attestation. The server checks the connected database name before rate-limit/audit writes. Staging still requires its exact HTTPS host and `moneytreeventures_staging`. The panel reports configured recipients and the rate-limit index state. Resend acceptance is never labelled as delivery.

The scheduled outbox worker still has no confirmed deployed 401 root cause. Current local diagnostics distinguish application Bearer rejection, redirect and other responses; inspect the next deployed worker category. In Netlify, compare the published Version and Live app settings for `APP_URL` and `OUTBOX_WORKER_SECRET`, including Functions scope and branch overrides. No pending event was processed.

## Rate-index commands

Read-only staging preflight:

```powershell
npm.cmd run db:indexes -- --rate-preflight --confirm-database moneytreeventures_staging
```

After review and explicit approval, the guarded nonproduction index setup is:

```powershell
npm.cmd run db:indexes -- --rate-init --confirm-database moneytreeventures_staging --confirm-non-production
```

It checks existing `supportRates` indexes and duplicate key groups, then creates only the required unique `identityHash_1_windowStart_1` index if absent. It does not modify records. The separate repurchase preflight remains required before its migration.

For the existing local development database, first run this read-only command:

```powershell
npm.cmd run db:indexes -- --rate-preflight --confirm-database moneytreeventures
```

If the index is missing, review the preflight and obtain explicit approval before the separate modifying command:

```powershell
npm.cmd run db:indexes -- --rate-init --confirm-database moneytreeventures --confirm-non-production --confirm-existing-development
```

The modifying command additionally requires `EMAIL_TEST_DATABASE_NAME=moneytreeventures` and `EMAIL_TEST_DATABASE_ROLE=local-development-only` in the local process, and refuses a Netlify runtime. It creates only the rate-limit index; it does not alter purchase, order or payment documents. Do not use the attestation if this database serves real customers or another live environment.

## Verification limits

Focused local tests, TypeScript, lint and build results are recorded in `docs/TEST-REGISTER.md`. The read-only local rate-index preflight failed during Atlas DNS SRV resolution (`ETIMEOUT`, 45,383 ms), so no actual index metadata was inspected. Real Cashfree amounts, MongoDB persistence, local authenticated owner access, Resend acceptance/delivery and Netlify worker authorization remain NOT_VERIFIED. No live email, payment, migration or deployment was performed.
