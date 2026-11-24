# MoneyTreeVentures — Database Design

**Status:** Phase 2.3 model foundation is implemented and used by the Phase 4.1–4.6 workflows. No catalogue seed data has been added, no production indexes have been applied, and MongoDB transaction behavior still requires a disposable replica-set integration run.

MongoDB Atlas + Mongoose is the planned application database. Use a replica-set deployment because payment fulfilment updates several collections atomically; MongoDB transactions require a replica set or sharded cluster. [MongoDB transaction requirements](https://www.mongodb.com/docs/manual/data-modeling/enforce-consistency/transactions/)

## Common rules

- Mongoose schemas use strict fields, timestamps, explicit validation, and explicit indexes.
- Zod validates external API inputs; Mongoose validates persisted documents. Never trust client-side schemas alone.
- Store money as integer minor units: `pricePaise`, `totalPaise`, `discountPaise`, `taxPaise`. Launch currency is `INR`. Convert to a two-decimal Cashfree amount at the gateway boundary.
- Displayed prices are tax-inclusive. Preserve a tax configuration/version and a tax breakdown in each order snapshot; do not hardcode an unapproved tax rate.
- Production index creation is an explicit idempotent deployment/init step, not automatic Mongoose startup work. MongoDB unique indexes are required for concurrency-safe uniqueness. [Unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/)
- IDs that cross module boundaries are stable IDs. References use ObjectId or the exact Better Auth user ID consistently; do not mix representations.

## Phase 2.3 implementation inventory

The model registry is in `src/lib/db/models/index.ts`. Individual strict Mongoose schemas, exported TypeScript domain interfaces, validators, and explicit indexes are grouped under `src/lib/db/models/`. Registration reuses `mongoose.models[name]` to avoid Next.js development hot-reload `OverwriteModelError`s. Models do not connect to MongoDB or create indexes at import time. The existing connection sets `autoIndex: false`; no migration, seeding, or index-application command is included in Phase 2.3.

| Model | Collection responsibility |
|---|---|
| `UserModel` | Application profile linked by unique `authUserId`; default role is `customer`. Email is normalized but deliberately not unique. Better Auth owns the canonical authentication identity and session/account records in separate collections. |
| `CategoryModel` | Slugged, sortable category; inactive/archived categories remain referenceable. |
| `ProductModel` | `pdf`, `pdf_bundle`, or `call_guidance`; INR price in paise; publication, SEO, category, asset/bundle, image-reference, and Call Guidance configuration. |
| `ProductAssetModel` | Immutable metadata for private PDF master versions; PDF MIME only, provider-neutral private object key, checksum and uploader. No PDF bytes or public URL. |
| `OrderModel` | Customer, currency, status, amounts and immutable order-line/customer/coupon snapshots. Cashfree payment-attempt IDs do not belong here. |
| `PaymentModel` | One Cashfree attempt per document; multiple attempts can reference one order. Optional Cashfree IDs have partial unique indexes. No card data or raw gateway body. |
| `PurchaseModel` | One entitlement per order line; download versus booking entitlement; bundle contents and PDF versions snapshotted; revocation metadata. |
| `CouponModel` / `CouponRedemptionModel` | Fixed paise or percentage coupons (percentage stored as basis points), restrictions, validity/limits and transactional reservations/redemptions. |
| `BookingModel` | Separate Call Guidance scheduling and fulfilment record; one booking per purchase entitlement, no PDF asset fields. |
| `WebhookEventModel` | Cashfree event idempotency key, payload digest, sanitized references/status; raw webhook body and secrets are excluded. |
| `OutboxEventModel` | Bounded allow-listed references for retryable PDF-personalization and transactional-email work; no arbitrary event payloads. |
| `AuditLogModel` | Append-oriented actor/action/target/changed-field/reason history for administrator, refund and entitlement actions; no secret or raw before/after payload. |

Model-level validation enforces required fields, enums, lengths, integer paise, publication-shape constraints, bundle self/duplicate checks, immutable order snapshots, entitlement type separation, valid scheduling ranges, and strict nested payloads. MongoDB unique/partial indexes enforce cross-document uniqueness only after the indexes are deployed. Schema validation cannot confirm that referenced category/product/asset/purchase records exist or have compatible types; those cross-document checks belong in later services and must be performed transactionally where required. Unit tests validate schema behavior and index declarations without claiming database enforcement.

Better Auth owns its auth, account, and session collections through the official adapter; these are not represented as application Mongoose models. Current application models include personalized PDF copies, download logs, customer purchase/booking data, and admin-managed catalogue and booking workflows. The Phase 3.2 application-profile provisioning workflow is described in the identity section below. See the fulfillment transaction design below.

## MongoDB connection foundation (Phase 2.2)

`src/lib/db/mongodb.ts` is the server-only connection entry point. Call `connectToDatabase()` from Node.js Route Handlers or server-side services only; do not import it into Client Components, connect at module scope, or connect once per request. The public homepage and production build remain independent of database credentials. Both `MONGODB_URI` and `MONGODB_DB_NAME` are required only when this function is called and are read through the lazy Phase 2.1 environment accessor.

The connection and in-flight promise are cached on `globalThis` to survive development hot reload and share concurrent calls within a warm Node.js isolate. Separate serverless isolates may each create a client and bounded pool; this cache is not a cross-instance lock or permanent process guarantee. Do not close the shared Mongoose connection after a request. Mongoose reconnects after an established connection is interrupted; a failed initial attempt is cleared so a later call can retry. Initial pool settings are conservative (`maxPoolSize: 5`, `minPoolSize: 0`); `autoIndex` is disabled and production indexes require an explicit, reviewed pre-production initialization step. Connection lifecycle events use the centralized server logger and omit driver messages, URIs, credentials, and database names; see [ERROR-HANDLING.md](./ERROR-HANDLING.md).

### Local and Atlas configuration

Copy `.env.example` to `.env.local` and configure a local database only when exercising database features. Use separate database users, credentials, and database names for local, staging, and production. Encode reserved characters in URI passwords. Obtain the application URI from Atlas using the deployment's **Connect → Drivers → Node.js** instructions. Atlas database users are separate from Atlas account users; create an application user restricted to `readWrite` on the application database. In Atlas Network Access, allow only trusted developer egress for local work. Do not use `0.0.0.0/0`. Before Netlify production use, verify its actual outbound-network options and choose a supported secure allow-listing/network arrangement; do not assume a stable Netlify Free egress IP.

Atlas Free is suitable for early development only and has storage/performance limits, no production-grade backup/reliability promise, and may pause after inactivity. Payment fulfilment will need multi-document transactions, which require a replica set or sharded cluster. Confirm the chosen Atlas deployment's topology, transaction support, backups, and availability before enabling live payments; a standalone local MongoDB server is not sufficient for transaction integration tests.

Manual connection verification is optional and must use non-production credentials. Unit tests mock Mongoose and do not contact Atlas. Models and index declarations are covered above; no live database connection or index deployment is performed by tests.

References: [Mongoose connections](https://mongoosejs.com/docs/connections.html), [Mongoose with Next.js](https://mongoosejs.com/docs/nextjs.html), [Atlas connect](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/), [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/), [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/).

## Collections

### `users` (application profile and authorization data)

Fields: `_id`, unique `authUserId` (stable external Better Auth user ID), `name`, `email`, normalized `emailNormalized`, optional `imageRef`, `role: customer | admin`, `status: active | blocked | deleted`, timestamps, optional `lastLoginAt`.

Rules: the schema derives normalized email from the email before validation. Email is not unique, so provider account linking is not blocked. `authUserId` is unique and stores Better Auth's stable user ID. New profiles default to `customer`; the schema does not promote administrators. First-admin promotion remains a controlled operator action. The profile is not an authentication credential store and does not hold sessions, passwords, OAuth tokens, or provider accounts.

Indexes: unique `authUserId`; non-unique normalized email lookup; `role + status` for future admin operations. Better Auth account/session indexes are managed separately by its MongoDB adapter.

### Better Auth collections (Phase 3.1)

The official Better Auth MongoDB adapter uses the existing connected Mongoose driver's native `Db` and `MongoClient`; it does not open a second connection. Better Auth's configured model names are `authUsers`, `authSessions`, `authAccounts`, and `authVerifications`, separate from the Mongoose `users` profile collection. Auth users are canonical for authentication identity; the Mongoose profile links through `authUserId` and remains canonical for application role/status. Google OAuth is the only enabled provider; email/password is disabled.

### Customer profile provisioning (Phase 3.2)

Better Auth's `databaseHooks.user.create.after` passes the server-observed Better Auth user ID, name, and email to the application profile provisioner. The provisioner uses `findOneAndUpdate({ authUserId }, { $setOnInsert: ... }, { upsert: true })`; role/status and profile fields are set only for a new record, with role fixed to `customer`. It never accepts a role from provider or browser data and never looks up a profile by email. The existing unique `authUserId` index is required to make concurrent upserts converge. Duplicate-key races reload by that same Better Auth ID. Server session utilities repeat this idempotent reconciliation when a profile is missing, so a post-create hook failure can be repaired on a later authenticated request. Blocked/deleted profiles are rejected by customer utilities.

The profile upsert and Better Auth user creation are separate writes and are not atomic across collections. A profile-index deployment check and monitoring/reconciliation remain operational requirements. No live MongoDB write or OAuth callback has been verified.

### Administrator authorization and bootstrap (Phase 3.4)

The Mongoose `users` profile is the only application role/status source. `getCurrentAdmin()` and `requireAdmin()` obtain the verified Better Auth session on the server, resolve the profile by its unique `authUserId`, and require `role: admin` plus `status: active`. Missing sessions produce an authentication error; customer, blocked, and deleted profiles are forbidden. Google identity data and browser-provided role/ID values cannot grant privileges.

The current initial promotion path is `npm run admin:bootstrap -- --user-id <BETTER_AUTH_USER_ID> --confirm-promote-admin`. It checks the exact ID in `authUsers`, requires an existing active Mongoose profile, and transactionally changes only `role` from `customer` to `admin` while inserting an audit event. **Phase 0 found this path does not check the verified Google email `moneytreeventuress@gmail.com`; do not use it to grant admin access until the single-email requirement is implemented and tested.** The CLI is not an HTTP endpoint and must never run automatically as part of build/deploy.

The existing `AuditLogModel` supports the bootstrap event without schema changes: `actorType: system` permits no human `actorUserId`, while `targetType`, `targetId`, `action`, `changedFields`, and `reason` capture the role change. No raw profile, OAuth credential, or secret is stored in the audit event. The operator must run the command only after the intended user has completed Google sign-in and the profile exists, against the intended environment. MongoDB transactions require the configured replica-set deployment; if unavailable, the command fails closed rather than promoting without its audit event.

The adapter receives the existing native client, enabling transaction-backed operations on replica-set MongoDB deployments. Better Auth's adapter may create its auth collections and supporting indexes at runtime; the project has not connected to a real database or created these indexes during Phase 3.1. Ensure the application database principal has the required collection/index permissions before enabling auth traffic.

### `categories`

Fields: Hinglish `name`, normalized unique `slug`, `description`, optional `imageRef`, `displayOrder`, `status: active | inactive | archived`, timestamps.

Rules/indexes: unique slug; public queries filter active/published categories and sort by `sortOrder`.

### `products`

Fields: `name`, unique `slug`, short/full description, `productType: pdf | pdf_bundle | call_guidance`, `categoryIds`, `pricePaise`, optional `compareAtPricePaise`, `currency: INR`, public image references, `publicationStatus: draft | published | archived`, featured/display order, SEO fields, `primaryAssetId` for an individual PDF, `includedProductIds` for a bundle, configurable call duration/instructions, archive metadata, timestamps.

Rules: prices are non-negative safe integer paise; currency is INR. Published individual PDFs require an assigned asset. Published Call Guidance requires duration/instructions and cannot reference a PDF. Bundles require a non-empty, unique, non-self list and cannot have a direct asset. MongoDB cannot validate the referenced products' types or existence here; a later publishing service must ensure bundle members are published PDF products and snapshot exact content at purchase. Draft/archived products are not public. Do not seed the ten intended products until actual approved catalogue details and files exist.

Indexes: unique slug; publication/display ordering; category/publication lookup; type/publication lookup. No text/Atlas Search index is created before search requirements are confirmed.

### `productAssets` (private master PDF metadata)

Fields: `productId`, `assetType: pdf_master`, `storageProvider: r2 | s3`, private `objectKey`, `originalFileName`, `mimeType: application/pdf`, `sizeBytes`, optional SHA-256 checksum, `version`, `status: draft | active | superseded | archived`, copyright-notice version, immutable uploader ID, timestamps.

Rules: only PDFs are supported. Version identity and master metadata are immutable; only an opaque private object key is stored (public HTTP URLs are rejected). One product may have at most one active version. Cross-check that only individual PDF products own master assets in a later service; bundle contents point to member assets and Call Guidance must have none. Original objects remain private and unchanged. No R2 upload or PDF processing occurs in this phase.

Indexes: unique `(productId, version)`; `(productId, status, version)`; partial unique active asset per product; unique `(storageProvider, objectKey)`.

### `personalizedPdfs` (private buyer-specific copy)

Fields: `userId`, `purchaseId`, `orderId`, `orderLineId`, `productId`, `sourceAssetId`, `sourceVersion`, `storageProvider`, opaque `objectKey`, output checksum/size, `status: queued | processing | ready | failed`, generation attempt/lease timestamps, watermark template version, created/updated timestamps.

Rules: create work only after verified successful payment and active entitlement. Render buyer name, registered email, merchant order reference, and purchase date as a subtle, professional watermark; include the approved copyright/personal-use notice. Keep the source master unchanged. A copy is private and owner-scoped. Generation is idempotent per user/purchase/source PDF version; retry failures without issuing a download until state is `ready`. A call-guidance entitlement must never create a row here.

Indexes: unique `(userId, purchaseId, sourceAssetId, sourceVersion)`; `(userId, status, updatedAt)`; unique `(storageProvider, objectKey)`.

### `downloadLogs` and rate-limit state

`downloadLogs` fields: `userId`, `purchaseId`, `personalizedPdfId`, `productId`, `sourceVersion`, request timestamp, outcome (`url_issued | denied | throttled | generation_pending | error`), correlation ID, minimal client metadata where justified. Never store the signed URL or duplicate watermark PII in logs. Apply a TTL retention policy after the required support/audit period is decided.

Log each request to issue a signed URL; this records a download request, not proof that the object transfer completed. R2 presigned URLs are bearer credentials and remain usable until expiry. Rate-limit signed URL issuance per user and document/window using atomic bounded counters or a TTL-backed counter collection.

Indexes: `(userId, createdAt)`; `(purchaseId, createdAt)`; TTL on `createdAt` only after retention is approved. Rate-limit state has unique `(userId, windowKey)` and expires after its window.

### `orders`

Fields: unique internal `orderReference`, `userId`, `gatewayEnvironment: sandbox | production`, minimal immutable purchase-time customer snapshot (`name`, registered `email`) for the requested watermark, `lines[]`, `subtotalPaise`, `discountPaise`, inclusive `taxPaise`, `totalPaise`, `currency: INR`, optional coupon snapshot, `orderStatus`, aggregate `paymentStatus`, `paidAt`, expiry/refund fields, timestamps, optional checkout idempotency key. Cashfree order/payment IDs belong to each Payment attempt, not this Order. Restrict the PII snapshot to server fulfilment/support; do not copy it into ordinary logs.

Each line immutably snapshots `productId`, name, slug, type, quantity, unit price, subtotal, tax/discount allocation, line total, and the asset version for an individual PDF or the included PDF product/asset version list for a bundle. Call Guidance snapshots its session duration and has no downloadable asset. Product edits do not rewrite historical orders. Validation checks line and aggregate totals in integer paise.

Suggested order states: `awaiting_payment`, `paid`, `expired`, `cancelled`, `partially_refunded`, `refunded`. A failed attempt does not necessarily fail the whole order because another attempt can be made while the order remains open.

Indexes: unique `orderReference`; partial unique `(userId, checkoutIdempotencyKey)` when supplied; `(userId, createdAt)`; `(orderStatus, createdAt)`.

### `payments` (one document per Cashfree attempt)

Fields: `orderId`, `userId`, `gatewayEnvironment`, unique attempt `paymentReference`, optional unique Cashfree `cashfreeOrderId` and `cashfreePaymentId`, amount/currency, normalized status (`pending | success | failed | interrupted`), provider status, safe method/reference metadata, failure code/sanitized summary, event/settlement timestamps.

Normalized attempt states are `pending | success | failed | interrupted`; preserve the bounded source status separately for support/reconciliation. Never store card data, credentials, raw gateway responses, or webhook bodies. A later failed attempt cannot downgrade a successful order. Database unique indexes provide concurrency-safe Cashfree ID idempotency after deployment.

Indexes: unique attempt reference; partial unique Cashfree order/payment ID when supplied; `(orderId, createdAt)`; `(userId, createdAt)`.

### `refunds` (one document per full-refund attempt)

Fields: `orderId`, successful `paymentId`, `userId`, initiating `adminUserId` where applicable, Cashfree environment/order/payment IDs, unique merchant `refundId`, stable request `idempotencyKey`, INR amount in paise, reason, normalized status, provider status/reference, and request/processed timestamps. Preserve failed attempts for audit and operations. A processing/pending attempt is resumed with its stored identifiers; only after a provider-confirmed terminal failure and order restoration may an administrator create a new attempt. MongoDB transactionally moves a paid order into refund processing before a new attempt is created, so only one attempt can be active for that order. Successful refunds leave the order refunded and revoke entitlements in the same transaction.

Indexes: unique `(cashfreeOrderId, refundId)` and idempotency key; `(orderId, createdAt)` for attempt history; `(status, updatedAt)` for reconciliation. Do not use a unique `orderId` index: failed attempts must remain in history while allowing a later retry.

### `purchases` (lifetime PDF/product entitlements)

Fields: `userId`, `orderId`, unique `orderLineId`, `productId`, snapshot product type, `entitlementType: download | booking`, bundle member and asset-version snapshots, `accessStatus: active | revoked`, `grantedAt`, optional `revokedAt`, reason and audit reference.

Rules: this model is the common purchase entitlement; its type keeps PDF and Call Guidance fulfilment separate. Individual PDF entitlements are lifetime and resolve future approved revisions. Bundle membership and included asset versions are frozen at purchase; adding later products does not expand old entitlements. Call Guidance receives `booking`, never `download`. A full refund revokes the entitlement and writes an audit record in the future transaction. Keep revoked history; partial uniqueness prevents duplicate active `(userId, productId)` grants.

Indexes: unique `orderLineId`; partial unique active `(userId, productId)`; `(userId, accessStatus, grantedAt)`; `(productId, accessStatus)`.

### `bookings` (1:1 Call Guidance only)

`BookingModel` fields: unique `bookingReference`, `userId`, `orderId`, unique `purchaseId`, `productId`, `status: awaiting_scheduling | scheduled | completed | cancelled`, requested availability slots/timezone, confirmed session start/end/timezone, snapshotted session duration/instructions, customer notes, private `adminNotes`, assigned admin, completion/cancellation metadata, timestamps.

The purchase referenced by `purchaseId` must have `entitlementType: booking` and correspond to a Call Guidance product; this cross-document check belongs in future fulfilment services. A scheduled booking requires valid start/end and timezone; completion/cancellation requires timestamps. Customer access must be owner-scoped and exclude admin notes; future administrator operations require server authorization and audit records. One purchase has at most one booking. No calendar integration is implemented.

Indexes: unique booking reference; unique purchase reference; `(userId, status, updatedAt)`; `(status, scheduledStartAt)` for admin scheduling.

### `coupons` and `couponRedemptions`

Coupon fields: normalized code, `fixed | percentage`, `discountValue` (fixed paise or percentage basis points), minimum order paise, optional max discount paise, validity window, global/per-customer redemption limits, allowed product/category IDs, active/inactive/archived state.

Redemption fields: `couponId`, `userId`, `orderId`, discount paise, state `reserved | redeemed | released`, reservation/redeemed/released timestamps.

Rules: percentage uses integer basis points (`10000 = 100%`) and cannot exceed 100%. Calculate discounts from current server-side data. Reserve limited uses atomically when creating an order, then redeem on verified payment or release on expiry/cancellation. Those race-safe limits require a later transactional service; schema validators alone cannot enforce redemption counts. Zero-total coupon behavior must be defined before checkout, and Cashfree must not receive a zero amount.

Indexes: partial unique active coupon code; unique `(couponId, orderId)`; `(couponId, userId, status)` for per-customer usage; reservations indexed by state/expiry.

### `faqs`

Fields: unique slug, Hinglish question/answer, `draft | published`, sort order, timestamps.

Indexes: unique slug; `(status, sortOrder)`.

### `siteSettings`

One singleton document with approved brand metadata, verified support contact, public social links, and configurable tax/pricing presentation values. Avoid storing secrets here; deployment secrets belong in the runtime secret manager.

### `contactSubmissions`

Fields: name, email, subject, message, `open | in_progress | resolved | spam`, created/updated time, optional resolution note/admin ID.

Rules: validate length, rate-limit submissions, minimize retained PII, define a retention period, and never echo submitted HTML unsanitized.

Indexes: `(status, createdAt)`; normalized email only if support workflow needs it.

### `webhookEvents`, `outboxEvents`, and `auditLogs`

- `WebhookEventModel`: Cashfree provider/event identity, event type, optional order/payment references, SHA-256 digest of the verified raw body, `received | processing | processed | retry | dead_letter`, timestamps and sanitized error code/summary. Unique `(provider, providerEventId)` prevents duplicate event insertion. Payment IDs also have unique partial indexes on Payment records; separate legitimate Cashfree events for one payment remain recordable.
- `OutboxEventModel`: allow-listed event type and aggregate type/ID, optional unique `dedupeKey`, bounded IDs/references in strict payload, `pending | processing | retry | sent | dead_letter`, attempt count and next retry timestamp. The schema intentionally rejects arbitrary/raw request data. Index `(status, nextAttemptAt)` and unique partial dedupe key.
- `AuditLogModel`: `admin | customer | system` actor, action, target type/ID, changed field names, reason/request ID and creation time. Human actors require a user reference. No raw before/after payload, secrets, signed URLs or unnecessary customer data. Current administrator, refund, entitlement, and catalogue services write audit records for their mutations. The model does not itself enforce append-only behavior at the database role level.

## Relationships and fulfilment transaction

```text
Category 1 -> many Products
User 1 -> many Orders
Order 1 -> many immutable order-line snapshots
Order 1 -> many Payment attempts
Paid PDF order line 1 -> one active Purchase entitlement
Paid Call Guidance order line 1 -> booking-type Purchase -> one Booking
Purchase + PDF version -> buyer-specific personalized PDF
User many <-> many downloadable Products through Purchases
Coupon 1 -> many CouponRedemptions
Cashfree webhook -> WebhookEvent -> Order / Payment / Purchase / Outbox
```

After Cashfree signature and payment facts are verified, the current MongoDB transaction claims the webhook event, records the Payment attempt idempotently, updates Order status, creates one Purchase per order line (download for PDFs/bundles or booking entitlement for Call Guidance), commits CouponRedemption, creates the initial Call Guidance Booking, and inserts durable OutboxEvent work. Duplicate and out-of-order events cannot downgrade a successful order. A confirmed full refund updates refund/order state, revokes the corresponding Purchase, records AuditLog entries, and queues customer notification work transactionally. Never call Cashfree, R2, PDF processing, or Resend while holding a MongoDB transaction open. PDF personalization and email happen after commit via idempotent outbox processing.

Transactions require a transaction-capable Atlas replica-set or sharded deployment. Unit tests in this phase validate schemas/index declarations only; duplicate-key enforcement and transactional behavior require an optional integration run against a properly configured replica set after index deployment.

## Index and uniqueness deployment notes

Indexes are declared explicitly in schema files and tested by inspecting their definitions. Partial unique indexes are used for optional IDs/keys, one active asset per product, active user/product entitlements, active coupon codes, and optional idempotency keys. MongoDB enforces these constraints only after indexes are created. `npm run db:indexes -- --confirm-database <exact-database-name>` explicitly creates declared indexes without using Mongoose auto-indexing or destructive `syncIndexes()`. Before running it, review the exact target, back up important data, and check for duplicates that would block unique indexes. If the obsolete `refund_one_full_refund_per_order` index is present, the command stops unless the operator also supplies `--drop-legacy-refund-index`; that flag drops only that named index. The command has not been run against any database in this workspace.

## Relationship and lifecycle policy

- References are used for users, categories, products, product assets, orders, payments, purchases, coupons, redemptions, bookings, webhook events, outbox events, and audit targets.
- Order customer/product/coupon values and line pricing are immutable snapshots. Bundle purchases also snapshot member product IDs, names/slugs and exact asset versions. Individual PDF entitlements remain attached to the product so future approved revisions are available.
- Product/category records referenced by history are archived/deactivated rather than deleted. Product asset versions referenced by purchases remain identifiable; masters remain private and immutable.
- Orders, payment attempts, webhook history, purchase entitlements, coupon redemptions and audit records are retained as financial/support history. User deletion must not cascade-delete these records; a later privacy workflow must anonymize profile data under approved retention/legal rules.
- Model references do not cascade automatically. Referential existence/type checks and any cleanup/anonymization must be explicit future services and migrations.

## Catalogue data policy

The initial ten products are intended, but their actual details are not in the files inspected for this update. Do not seed or publish invented values. Create drafts only when the approved product list, actual prices, copy, and asset files are supplied.
