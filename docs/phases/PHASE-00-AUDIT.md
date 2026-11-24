# Phase 0 — Repository Audit and Recovery Baseline

Audit date: 2026-11-20. Scope was read-only application/config inspection, local tests already executed on the same application source, safe local environment validation, and documentation. No production database, provider, account, payment, refund, email, deployment, or DNS was accessed. No application code or data was changed in Phase 0.

## 1. Executive summary

The project is a substantial Next.js 16.4.6 App Router digital-products application using React 19, strict TypeScript, Tailwind CSS v4, Mongoose, Better Auth/Google, Cashfree, private R2 storage, and a Resend outbox. The product/catalogue/payment/fulfillment workflows have services, Route Handlers, models, and local mocked tests. This is not evidence of production readiness.

Critical findings:

- Admin access is role-based, not restricted to the required sole verified Google email. Newly created profiles default to `customer`; the explicit bootstrap command is likely why an owner without an already-promoted profile cannot enter `/admin`. The database was not inspected. The bootstrap does not itself check the allowlisted email or Google `emailVerified` value.
- `/admin/login`, account-page logout, and a branded root `not-found.tsx` are absent. The authenticated `/login` state has a sign-out button, but that does not satisfy the requested account control.
- A local unknown route returned HTTP 404. An invalid product slug returned not-found HTML/title but HTTP 200 in the running development server; this needs a custom 404 and production-mode route check.
- The new language requirement says English default, but the root HTML uses `lang="hi-Latn-IN"`, and copy is primarily Roman Hinglish. No language switch exists.
- Product model/media handling supports optional thumbnails and optional promotional video, with a first-letter fallback and no-autoplay video behavior. Catalogue database contents were not inspected; no seed script or supplied external seed specification is in the repo.
- `src/components/home/featured-products.tsx` renders seven hardcoded resource-style cards and custom art. They are not read from the product API/database, do not link to product details, and are not the supplied ten-product seed records. Treat them as unapproved presentation placeholders, not catalogue products; the requested homepage collection should use approved database records or be withheld until those records exist.
- The latest build check failed because the existing Geist and Geist Mono Google Font downloads are unreachable. Production smoke and fresh client-bundle scanning could not run.

Feature classifications follow the required vocabulary. They distinguish automated test evidence from end-to-end/live validation.

## 2. Repository overview

| Area | Implementation inventory | Assessment |
|---|---|---|
| App/UI | `src/app/**`, `src/components/**`, `src/app/globals.css`, `src/app/layout.tsx` | App Router pages, theme, homepage, catalogue, cart, account/admin UI. No global custom not-found route. |
| Configuration | `package.json`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `.env.example`, `.env.local` | Next 16.4.6, Cache Components/Partial Prefetching, scripts and lazy env schema. `.env.local` is ignored. |
| Auth/admin | `src/lib/auth/**`, `src/app/api/auth/[...all]/route.ts`, `src/app/admin/**`, `scripts/bootstrap-admin.ts` | Better Auth Google provider, role gate, bootstrap; the sole-email invariant is missing. |
| Database | `src/lib/db/**`, `scripts/initialize-indexes.ts` | Mongoose models and explicit index initializer; no production index/database operation performed. |
| Catalogue | `src/lib/catalog/**`, `src/components/catalog/**`, `src/app/products/**`, `src/app/api/products/**` | Database-backed public/admin services and lifecycle tests. |
| Commerce | `src/lib/cart/**`, `src/lib/checkout/**`, product/payment APIs | Cart, pricing, coupons, immutable order snapshots and idempotency code present; local tests pass. |
| Payment/refunds | `src/lib/payments/cashfree/**`, `/api/webhooks/cashfree` | Cashfree only, sandbox config present locally, raw-body signature and reconciliation tests. No sandbox calls. |
| PDF | `src/lib/storage/**`, `src/lib/fulfillment/**`, purchase/download APIs | Private R2-compatible provider, integrity validation, watermark, ownership policy and signed URLs. Local mocks only. |
| Booking/email | Booking services/routes/admin UI; `src/lib/email/**`; Netlify function | Separate booking entitlement and outbox; schedule tests mocked only. |
| Tests | `tests/**`, `scripts/run-tests.mjs` | Node test runner, browser test, unit/provider/API tests; no valid production build artifact. |
| Seed scripts | `scripts/**` | Admin bootstrap and database index initialization only. No product/category seed script. |

No repository middleware, Proxy, root `app/not-found.tsx`, product seed file, review module, contact submission API, or i18n module was found. No separate Auth.js package/config is used; auth is Better Auth.

## 3. Route inventory

**Public:** `/`, `/products`, `/products/[slug]`, `/about`, `/contact`, `/faqs`, `/privacy-policy`, `/terms`, `/refund-policy`, `/shipping-delivery`.

**Customer:** `/login`, `/cart`, `/checkout`, `/checkout/[orderId]`, `/checkout/return`, `/account`. `/resources` redirects to `/products`.

**Admin:** `/admin`, `/admin/products`, `/admin/bookings`; API routes under `/api/admin/**`.

**Other API:** Better Auth `/api/auth/[...all]`; public `/api/products`, `/api/categories`; customer orders/payments, bookings, purchases/download; internal outbox; Cashfree webhook.

**Missing:** `/admin/login`, custom root `not-found.tsx`; review routes/pages; contact form API. The current sitemap lists the home, catalogue, and static informational/legal pages but no product slugs.

## 4. Authentication findings

- `src/lib/auth/config.ts` configures Better Auth with Google OAuth (`openid`, `email`, `profile`), Mongo adapter, server-side session records, and secure cookie settings. The installed Google provider maps Google's `email_verified` claim to Better Auth's `emailVerified` field.
- `src/lib/auth/session.ts` reads the verified Better Auth session and resolves a profile by immutable `authUserId`; it passes only id/name/email to profile provisioning. `src/lib/auth/customer-profile.ts` normalizes email and creates new profiles as `customer`.
- `src/lib/auth/admin.ts` accepts any active profile whose DB role is `admin`; it does not compare `emailNormalized` with `moneytreeventuress@gmail.com` or check verified-email state.
- `scripts/bootstrap-admin.ts` takes an arbitrary exact Better Auth user ID plus explicit confirmation. `src/lib/auth/admin-bootstrap.ts` checks that identity/profile exists and is active, then promotes it. The Mongo store checks `authUsers` by ID only and does not verify address or `emailVerified`. It writes an audit event transactionally. This is operator-only, but it violates the new single-email invariant.
- `/admin/layout.tsx` uses `requireAdmin`; anonymous users redirect to `/login`, signed-in non-admin profiles see access denied. Admin API wrappers also perform server-side auth. Tests cover role gates but not the required email allowlist.
- `/login` renders `Continue with Google`. There is no `Admin Login` control and no `/admin/login` route. The actual Better Auth callback remains `/api/auth/callback/google` by provider convention; do not replace it with `/admin/login`.
- The safest correction is to preserve Better Auth and existing session IDs, require a normalized allowlisted email with verified Google identity both when bootstrapping and at runtime, constrain bootstrap so no other identity can be promoted, retain active status/server-side guards, add the `/admin/login` entry UI, and keep customer sign-in normal. Do not use email as the DB identity join key. Verify each admin API/mutation remains gated.
- The user's inability to access admin is most likely because Google-created profiles are customer by default and admin requires a separately promoted active DB profile. The actual profile state cannot be determined without querying a database; no database was queried. A missing `/admin/login` also means the requested route cannot currently be used.

**Classification:** Google identity/profile foundation `IMPLEMENTED_AND_TESTED`; role-based admin boundary `IMPLEMENTED_AND_TESTED`; strict sole-email admin `MISSING`; admin login entry `MISSING`; account logout `PARTIALLY_IMPLEMENTED` (button exists only in authenticated `/login` state, not `/account`).

## 5. Environment findings

- `.env.local` exists, is excluded by `.gitignore`, and Next.js reports loading it. Values were never printed.
- The actual local environment was loaded using `@next/env`; `parseServerEnv(process.env)` returned successfully. MongoDB, Better Auth, Google OAuth, Cashfree, R2, and Resend variable groups were populated. `CASHFREE_ENVIRONMENT` is sandbox. This confirms schema/config presence only: no database or provider connection was attempted.
- `MONGODB_TEST_URI` is absent; the dedicated replica-set integration test correctly skips.
- Environment names follow `src/lib/env/schema.ts`; validation is lazy/runtime and errors do not include secret contents. `NEXT_PUBLIC_*` settings are rejected unless approved, and no public variables are intended for current integrations.
- Local `.env.local` values are development configuration. Staging/production separation in Netlify and Google Console callbacks has not been tested. Do not infer external credentials are valid from local schema validation.
- Better Auth is used, not Auth.js. Google env names and Better Auth URL/secret group are internally consistent and parse locally; real OAuth redirect configuration remains unverified.
- Cashfree client configuration is set to sandbox locally; R2 and Resend groups are populated locally. No payment, refund, upload, email, or scheduled call was made.
- The Geist build blocker remains: `next/font/google` fetches for Geist and Geist Mono fail in this network-restricted build environment.

## 6. Product and external seed-data integration

Existing product fields include `name`, `slug`, `shortDescription`, `description`, `productType`, `bundleKind`, `categoryIds`, `pricePaise`, `compareAtPricePaise`, `imageRefs`, `promotionalVideoUrl`, `features`, `benefits`, `includedContent`, `faqs`, `featured`, `displayOrder`, `seo`, `primaryAssetId`, `includedProductIds`, and Call Guidance fields.

The intended mapping and unsupported fields are recorded in [DECISIONS.md](../DECISIONS.md). In short: monetary values require integer paise conversion; categories are IDs; bundles require explicit `bundleKind` and eligible PDF product IDs; `video`/`video_and_files` cannot be treated as purchased PDFs; audience, format details, leaf number, tags, and target customers lack dedicated schema fields.

The external `seed-data.ts` source is not in the workspace and was not searched for outside the project. No replacement data or product records were made. Four categories and ten titles in the brief are future catalogue content only. `/products` reads published records through the public product API/service; product data is not to be hardcoded on the homepage.

The supplied intended titles are: The Whole Money Tree Bundle; Freelance Starter Kit; Ghar Se Earning Blueprint; Canva Design Side Hustle; Content Writing in Hinglish; Social Reselling from Home; Real vs Scam Job Checker; Instagram Page Growth Playbook; Online Tuition Setup; and 1:1 Clarity Call. Intended categories are Bundle; Freelancing aur content; Ghar se kaam; and Guidance aur safety. These are inventory labels only; no descriptions, prices, files, customer statistics, or records were invented. The seven current homepage cards do not match the complete external catalog and must not be used as replacement records.

**Classification:** catalogue model/services `IMPLEMENTED_AND_TESTED` (local tests); full DB-backed public/customer/admin journey `IMPLEMENTED_NOT_END_TO_END_TESTED`; seed script/data `MISSING` / `BLOCKED_BY_CONFIGURATION` (owner source unavailable).

## 7. Media and PDF findings

- Thumbnail is optional in `imageRefs`; the catalogue and detail media component have a safe visual fallback. Promotional video is optional, HTTPS validated, separate from asset storage, and never an entitlement. `ProductMainMedia` uses controls, poster, `preload="none"`, `playsInline`, and no autoplay; the browser test passes.
- PDF masters use private R2-compatible object keys, PDF signature/size/integrity checks, and active asset rules before publishing. PDF buyer copies are watermarked, kept private, tied to owner-scoped entitlements, and downloaded through short-lived signed URLs with rate logging.
- Bundles snapshot included PDFs; Call Guidance does not get PDF entitlements. Refund revocation only follows verified success. Local mock tests pass; no R2 integration or Mongo transaction was executed.
- Existing watermark font has limited non-Latin script support; see launch readiness. Do not claim broad script support.

**Classification:** media fallback and no-autoplay `IMPLEMENTED_AND_TESTED`; private PDF policy `IMPLEMENTED_AND_TESTED` with mocks; R2/PDF production delivery `IMPLEMENTED_NOT_END_TO_END_TESTED`.

## 8. Payment integration findings

Cashfree is the sole configured provider. Services create Hosted Checkout sessions server-side; browser return is not proof of payment. Webhooks verify signature from original request body, enforce request-size limits, reconcile order/payment identity, amount, INR currency and successful status, and use idempotent state transitions. Refund service verifies provider status before entitlement revocation/audit/outbox. Unit tests cover these boundaries. No sandbox call, real order, or refund was performed.

**Classification:** implementation/test logic `IMPLEMENTED_AND_TESTED`; Cashfree sandbox journey `IMPLEMENTED_NOT_END_TO_END_TESTED` (sandbox configuration is present locally, but no external request was run).

## 9. Test results

Recent same-source local checks: `npm test` reported 230 passing tests, one skipped Mongo replica-set transaction test, and two passing mocked Netlify function tests; `npm run lint`, `npx tsc --noEmit`, and `npm run test:browser` passed. A fresh `npm run build` failed before compilation on inaccessible Google Font downloads. Production smoke and client-bundle scans were not run because there is no fresh successful build. Details and exact commands are in [TEST-REGISTER.md](../TEST-REGISTER.md).

## 10. Security findings

- Existing positives: server-only environment/auth/payment/storage modules; DB-role checks on admin pages/APIs; authenticated customer ownership scopes; Cashfree raw-body signature/request limits; private R2 keys and signed owner-checked download; log redaction; configured basic response headers.
- Critical mismatch: role-only admin access and unallowlisted bootstrap do not satisfy sole verified email `moneytreeventuress@gmail.com`.
- No CSP is configured. CSP compatibility with Cache Components, Google OAuth, Cashfree and current assets must be tested in staging before enforcement.
- `.env.local` is ignored. One-commit common-format scan found no matches; working-tree scan found only test fixtures for Mongo credential-URI patterns. This is not a complete scanner; fresh client bundle scan is blocked.
- `debug.log` is untracked and not ignored. Review for private content and exclude/remove before public publication. Much of the application worktree is untracked; review the exact publication set. Do not claim the repository is publish-safe based on this pattern scan.
- `robots.txt` is not an authorization mechanism. Its rules list `/admin/` and `/account/`, but not the exact root paths; metadata also sets noindex on protected account/admin page. Verify crawler behavior in staging. A published product sitemap entry is missing. Production response headers were not checked due the build blocker.

## 11. Custom 404 findings

No root `src/app/not-found.tsx` exists. Unknown path `/phase0-unknown-route` returned HTTP 404 using Next.js default UI. `/products/INVALID%20SLUG` returned not-found body/title but HTTP 200 from the running local development server. `src/app/products/[slug]/page.tsx` calls `notFound()` for malformed/missing products, but route status behavior is not adequate evidence yet. No custom English-branded page or direct production verification exists.

**Classification:** custom 404 `MISSING`; dynamic invalid-slug response `BROKEN` with observed HTTP 200 in local dev; built production status `NOT_INSPECTED` due failed build.

## 12. Known blockers

1. Resolve sole-admin authorization and bootstrap mismatch before granting owner access.
2. Resolve missing `/admin/login` and account logout controls.
3. Fix/verify HTTP 404 behavior and implement custom not-found UI.
4. Repair or intentionally redesign the build-time font acquisition path so production build can run.
5. No disposable replica-set test database or provider sandbox executions.
6. External product seed data is not present; do not generate replacements.
7. No review system, contact submission, language switch, or finalized legal policy content.
8. No dynamic product URLs in sitemap; no CSP; debug.log/untracked files need publication review.
9. Phase numbering conflict: existing Phase 2 is foundation; supplied Phase 0 says admin implementation belongs Phase 2. No authoritative full Phase 0-22 roadmap is present in `docs/`.

## 13. Recommended Phase 1 actions

Phase 1 is not defined in the repository, so this is a proposal, not an approved implementation roadmap:

1. Owner reviews this audit and confirms the Phase 1/2 numbering.
2. Approve the strict admin remediation design: verified normalized email allowlist, bootstrap restriction, role/session checks, `/admin/login`, and account logout. Do not access production data.
3. Decide how to address the local Google Font build blocker without silently changing the design system.
4. Confirm custom 404 requirements and product sitemap strategy.
5. Record the authoritative Phase 0-22 roadmap and obtain the external seed source separately before Phase 6.

Stop after this audit. No implementation phase is started.
