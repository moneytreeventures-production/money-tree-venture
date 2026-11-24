# MoneyTreeVentures — Cashfree Payment Flow

**Status:** Approved design. No Cashfree request, checkout, webhook, or payment code is implemented by this document.

Cashfree is the only payment gateway. The integration uses Cashfree Hosted Checkout: the server creates the order with its secret credentials; the browser opens checkout using the returned payment session. Cashfree explicitly requires order creation server-side and documents the hosted checkout sequence. [Hosted Checkout](https://www.cashfree.com/docs/payments/online/web/redirect), [Create Order API](https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order)

## Payment records and trusted values

- `Order` is the merchant's immutable purchase request: customer, line snapshots, INR totals, coupon/tax snapshots, and lifecycle state.
- `Payment` is one Cashfree attempt. A single order may have multiple attempts; each has its own `cf_payment_id` and state.
- `Purchase` is the lifetime access entitlement created only after verified success.
- `BookingEntitlement` and `Booking` are created only for the 1:1 Call Guidance product; they have no PDF/download relationship.
- The server reads product prices and coupon rules from MongoDB. It calculates tax-inclusive INR totals in integer paise and converts to Cashfree's two-decimal amount at the API boundary.
- Never accept the submitted browser total as authoritative. Before entitlement activation, compare the verified Cashfree order/payment identity, amount, currency, and successful status against the stored order snapshot. Any mismatch is quarantined for reconciliation and does not grant access.
- Order lines remain immutable even after catalogue prices or descriptions change.

## End-to-end sequence

1. **Restore guest cart after Google login.** The cart contains product IDs and quantities only. Re-fetch active products and current prices from MongoDB; show the user a recalculated total before payment. Checkout is unavailable until the user is signed in.
2. **Create merchant order.** The authenticated browser sends product IDs, allowed quantities, coupon code, and a checkout idempotency key. Zod validates the request. Server code checks ownership, availability, coupon eligibility/limits, and tax-inclusive price configuration. It writes an `awaiting_payment` order with immutable line and total snapshots.
3. **Create Cashfree order.** The server sends the stored INR amount, currency, order identity, customer details, return URL, and a UUID `x-idempotency-key`. Cashfree documents this key for safe retries after timeout/failure, and requires a unique merchant order ID. Pin the Cashfree API version explicitly. [Create Order API](https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order)
4. **Open Hosted Checkout.** The server returns only the order reference and payment session needed by the signed-in buyer's browser. Cashfree's web SDK opens Hosted Checkout in redirect mode. No client secret, API credentials, or trusted price is sent to the client.
5. **Return page.** Cashfree returns the browser to the configured URL. The return query is an untrusted locator only. The page asks the server for order status; the server checks the current user owns the order and obtains status from the verified webhook/database or Cashfree status API. A redirect, SDK callback, screenshot, or frontend success value never grants access.
6. **Webhook verification.** The Route Handler reads `request.text()` before JSON parsing. It reads `x-webhook-timestamp` and `x-webhook-signature`, then verifies the exact raw body using Node `crypto` HMAC-SHA256/base64 over timestamp concatenated with raw body and a constant-time comparison. Do not parse, normalize, reserialize, or change whitespace before verification. [Cashfree signature verification](https://www.cashfree.com/docs/payments/online/webhooks/signature-verification)
7. **Idempotent fulfilment.** Verify first. Deduplicate using Cashfree's event idempotency header when configured for webhook version `2025-01-01` or later, and enforce unique indexes on Cashfree payment-attempt IDs. In a MongoDB transaction, record the webhook event/payment attempt, validate it against the order, update order/payment state, create the entitlement type dictated by each immutable order-line product kind, commit coupon redemption, and insert durable outbox work. [Cashfree webhook overview](https://www.cashfree.com/docs/payments/online/webhooks/overview), [Cashfree webhook idempotency](https://www.cashfree.com/docs/payments/online/webhooks/webhook-indempotency)
8. **Separate fulfilment branches.** PDF guide/starter-kit/bundle lines create purchase entitlements and PDF-personalization work. A Call Guidance line creates one booking entitlement and an `awaiting_customer` booking record, plus customer-facing scheduling instructions; it never queues PDF generation or receives a download link. All records are idempotent per paid order line.
9. **Personalize PDF copy.** After the fulfilment transaction commits, read the private, unchanged master PDF from Cloudflare R2 through the provider-independent storage adapter. Render a subtle, professional watermark on the buyer copy containing buyer name, registered email, merchant order reference, and purchase date, plus the approved copyright/personal-use notice. Store that copy in the private bucket under an opaque object key. Record its source asset/version and checksum. Retriable generation must not mutate the master or create duplicate copies. Issue no download until the personalized-copy status is `ready` and the entitlement is active.
10. **Email delivery.** A worker sends the Resend email after commit, retries transient failures, and marks permanently failing events for review. An email outage does not roll back payment fulfilment.
11. **Customer library and booking status.** Library access requires a fresh session, ownership check, and active PDF entitlement. Booking customers can see only their own booking and approved scheduling instructions. Admin booking management/confirmation requires server-side admin authorization and an audit record.

## State handling

| Input/status | Order behaviour | Entitlement behaviour |
|---|---|---|
| Created, checkout open | `awaiting_payment` | None |
| Pending/late authorization | Remains `awaiting_payment`; show “payment verify ho raha hai” | None; poll/verify later |
| Failed/user dropped/interrupted attempt | Record that attempt; order may remain open for retry until expiry | None |
| Verified Cashfree success with exact order, amount, and INR currency match | `paid`, immutable `paidAt` | PDF lines: purchase entitlement + personalization job. Call Guidance line: booking entitlement + `awaiting_customer` booking. |
| Duplicate event/payment ID | Acknowledge without repeating fulfilment | No duplicate grant/email |
| Out-of-order failure after a success | Do not downgrade a paid order | Keep the active entitlement |
| Amount/currency/order mismatch | Do not mark paid; flag for reconciliation | None |
| Full refund completed and confirmed by Cashfree | Record refund state and actor/reference | Revoke corresponding PDF purchase or booking entitlement and audit it |

Cashfree says payment `SUCCESS` is the terminal success state and that pending/failed attempts must not be treated as paid; it also documents multiple attempts per order and at-least-once webhook delivery. Preserve each attempt and make state transitions monotonic. [Webhook idempotency](https://www.cashfree.com/docs/payments/online/webhooks/webhook-indempotency), [Webhook overview](https://www.cashfree.com/docs/payments/online/webhooks/overview)

## Retries, failure recovery, and response policy

- If Cashfree order creation times out, retry the same order request with the same idempotency key and merchant order ID. Do not create a second merchant order merely because the HTTP response was lost.
- If the browser closes, webhook delivery still finalizes a verified payment. The account order-status page can also ask the server to check Cashfree.
- If signature verification fails, reject the event and do not parse/process it as payment truth.
- If the database is temporarily unavailable after verification, return a failure response so Cashfree can retry. Return success only after the event has been durably processed or deduplicated.
- Use a unique `cf_payment_id`, event idempotency key, unique order identity, and unique active user/product entitlement as independent duplicate protections.
- Keep failed/pending attempts for audit and customer support. Do not use them to overwrite a successful order.

## Refund and entitlement policy

A full refund revokes the purchase only after Cashfree confirms refund completion. Store every attempt and its provider reference/status/amount in `refunds`, order state in `orders`, and actor/reason plus entitlement revocation in `auditLogs`. A verified terminal failure restores the paid order and permits a new uniquely identified refund attempt; pending or processing attempts are resumed with their original idempotency key. At most one attempt may be active for an order, enforced by the transactional order-state transition. Partial refunds are not supported. Dispute/chargeback treatment and support restoration after mistaken revocation remain product decisions and must be handled manually until approved workflows exist.

## Private PDF delivery and watermarking

- Cloudflare R2 Standard is the initial private object provider, accessed through a storage interface that can later be backed by Amazon S3. Keep the R2 bucket private and do not configure a public custom domain.
- The master PDF is uploaded/approved privately and remains byte-for-byte unchanged. Payment success alone does not expose it.
- Once success and order values are verified, create one generation job per buyer, purchase, source PDF, and source version. Generate buyer-specific copies outside the MongoDB payment transaction, then store each result privately. The copy includes the buyer name, registered email, order reference, purchase date, and approved copyright/personal-use notice as a subtle watermark.
- At each download request, authenticate the user; load the personalized PDF by server-side IDs; confirm the requester owns its purchase and the entitlement remains active; enforce a reasonable rate limit; write a download-request log; then return a short-lived signed `GET` URL. Never authorize from a submitted object key or expose R2 credentials.
- The URL is a bearer credential until expiry. A forwarded link could be used during that short interval; use a short TTL and avoid logging the URL. The application can accurately log signed-link issuance/denial, but cannot confirm that a direct-to-R2 transfer completed from that log alone. Consider storage event telemetry or an authenticated streaming proxy only if confirmed-transfer tracking is required later.
- The current renderer uses PDF Standard Helvetica. Buyer-name characters outside its supported encoding are substituted; select and test a suitably licensed embeddable font before relying on names in unsupported scripts.
- Download logs should store the user, purchase, PDF version, timestamp, and result, with limited retention and no redundant watermark PII. Apply per-user limits to signed-link requests; tune thresholds after observing legitimate usage.
- Do not use PDF password protection or copy/print restrictions as the primary control. Watermarks discourage redistribution and aid attribution but do not make redistribution impossible.

## 1:1 Call Guidance booking workflow

After the same verified Cashfree success gate, create a `bookingEntitlement` and one pending `booking` record for the order line, in the fulfilment transaction or through a durable idempotent outbox operation. Do not create a PDF asset/copy or download endpoint for this product. Show approved scheduling instructions in the authenticated account. The customer submits availability through an owner-scoped endpoint; an authorized admin manages and confirms the schedule, with status changes audited. For the first release, scheduling is manual without a calendar provider. A full confirmed refund revokes the booking entitlement and updates/audits the booking according to the final refund operations policy.

## Environment separation and safety

- Sandbox and production are separate Cashfree API environments, not mock implementations. `CASHFREE_ENVIRONMENT` selects a fixed server-side API host; never accept an arbitrary Cashfree base URL from configuration or the client.
- Local and staging have only sandbox credentials and test data. Production alone has the client's production credentials, production database/R2 resources, return URL, webhook registration, and verified domain. Configure Netlify Production, `Branch: staging`, Deploy Preview, and local values separately; production credentials must never be set for preview/staging/local. Netlify Free has deploy-context values but not variable scopes, so never expose secrets through client code or `NEXT_PUBLIC_` variables; server-only code must be the only reader. Stamp `gatewayEnvironment` on orders, payment attempts, and webhook events.
- Production site: `https://moneytreeventure.com`. Planned production webhook: `https://moneytreeventure.com/api/webhooks/cashfree`. Staging uses its own domain and sandbox webhook. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the Git-integrated Netlify workflow, GoDaddy DNS procedure, and environment isolation checklist.
- Sandbox checkout must call Cashfree sandbox order APIs, open actual Cashfree Hosted Checkout in sandbox, and receive sandbox status/webhooks. Do not claim integration completion with a mocked checkout or a page that only opens.
- All Cashfree calls and signature verification run in the Node server runtime.
- Keep `CASHFREE_CLIENT_SECRET` server-only. Never log secrets, payment sessions, full signed downloads, or unnecessary customer data.
- Keep Cloudflare R2 tokens server-only and scoped to the private bucket; use opaque object keys and short URL expiry.
- Phase 2 may validate Cashfree environment/config shape only. It must not create orders or initiate real payments.
- Before production, complete every sandbox case in the [payment-to-download acceptance checklist](./DEPLOYMENT.md#payment-to-download-integration-acceptance-checklist). A live low-value payment or refund requires the client's explicit authorization each time; none is authorized by this architecture document.

## Official references

- [Cashfree Hosted Checkout — Web](https://www.cashfree.com/docs/payments/online/web/redirect)
- [Cashfree Create Order API](https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order)
- [Cashfree Get Order API](https://www.cashfree.com/docs/api-reference/payments/latest/orders/get-order)
- [Cashfree Webhooks overview](https://www.cashfree.com/docs/payments/online/webhooks/overview)
- [Cashfree signature verification](https://www.cashfree.com/docs/payments/online/webhooks/signature-verification)
- [Cashfree webhook idempotency](https://www.cashfree.com/docs/payments/online/webhooks/webhook-indempotency)
- [Cashfree Dev Studio](https://www.cashfree.com/devstudio)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
