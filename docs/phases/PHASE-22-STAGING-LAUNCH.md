# Phase 22A: HTTPS staging preparation

Status: **PREPARED LOCALLY; STAGING NOT CONFIGURED OR DEPLOYED** (24 November 2026). This document authorizes no provider transaction, bucket change, email send, scheduled job, migration, or deployment.

## Verified repository behavior and remaining R2 gate

| Purpose | Repository variable | Code path | Public access expected |
|---|---|---|---|
| PDF masters and personalized copies | `R2_BUCKET_NAME` | `src/lib/storage/r2/client.ts` and PDF fulfillment | No |
| Product upload staging | `R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME` | `src/lib/storage/public-media.ts` | No |
| Published product images/video | `R2_PUBLIC_MEDIA_BUCKET_NAME` and `PUBLIC_MEDIA_BASE_URL` | `src/lib/storage/public-media.ts` | Yes, for approved product objects only |

The environment schema rejects equal bucket names. The private R2 client reads/writes PDF objects only in `R2_BUCKET_NAME`. Product uploads first enter the staging bucket and validated objects are copied to the public media bucket; published URLs are formed from `PUBLIC_MEDIA_BASE_URL` and product-media object keys. The authenticated PDF route checks the signed-in customer and paid entitlement, obtains the private personalized bytes, and responds with PDF bytes and `private, no-store` headers. It does not return an R2 public object URL. These are **code findings**; actual Cloudflare bucket permissions and domain attachments are **NOT_VERIFIED**.

**CRITICAL staging gate:** In Cloudflare Dashboard > R2 Object Storage > each of the three buckets > Settings, inspect both **Public Development URL** and **Custom Domains**. The private PDF and product-upload staging buckets must have no enabled `r2.dev` URL and no enabled public custom domain. For the approved public product-media bucket, confirm the intended public domain is attached to that bucket alone, is Active over HTTPS, and serves only approved product objects. A public custom domain exposes that bucket regardless of whether `r2.dev` is disabled; inspect both controls independently. If either private bucket has public access, stop staging work and remediate in Cloudflare with the owner. Do not connect a public domain until this inspection is complete. See [Cloudflare R2 public bucket controls](https://developers.cloudflare.com/r2/buckets/public-buckets/).

Local name-only configuration check: all three bucket variables were present and pairwise distinct; `APP_URL` and `BETTER_AUTH_URL` classified as localhost HTTP; `PUBLIC_MEDIA_BASE_URL` classified as HTTPS `r2.dev`; `CASHFREE_RETURN_URL_BASE` classified as localhost HTTP; Cashfree mode classified as sandbox. No value or credential was printed. This local configuration cannot satisfy the production media check and is not an approved staging configuration.

## Exact environment contract

Use a distinct, owner-approved HTTPS **site origin** for staging. Angle-bracket terms below mean owner-selected values; they are not domain names to enter literally. Keep staging and future production in separate Netlify sites or strictly isolated deploy contexts and databases. Do not redirect production customers to staging.

| Setting | Local development | HTTPS staging | Future production |
|---|---|---|---|
| `APP_URL` | localhost origin | approved staging HTTPS site origin, no path/query | approved production HTTPS site origin |
| `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` | localhost origin and local secret | same staging origin, staging-only secret | production origin and distinct secret |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | approved local OAuth client | nonproduction OAuth client; exact staging redirect URI registered | separately approved production client |
| `CASHFREE_ENVIRONMENT`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET` | sandbox | **sandbox only**, staging credentials | production only after separate owner approval |
| `CASHFREE_API_VERSION`, `CASHFREE_WEBHOOK_VERSION` | configured valid `YYYY-MM-DD` versions | supported versions matching Cashfree sandbox configuration | separately validated versions |
| `CASHFREE_RETURN_URL_BASE` | `http://localhost:3000/checkout/return` when using port 3000 | `<approved staging HTTPS origin>/checkout/return` | `<approved production HTTPS origin>/checkout/return` |
| Derived Cashfree webhook URL | omitted for localhost HTTP | `<approved staging HTTPS origin>/api/webhooks/cashfree` | production counterpart after approval |
| `MONGODB_URI`, `MONGODB_DB_NAME` | local development DB | dedicated nonproduction replica-set DB, never production records | approved production DB with restricted access |
| `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_REGION` | configured account/endpoint | approved staging R2 configuration | approved production configuration |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | private PDF bucket | private staging PDF bucket and scoped credentials | private production PDF bucket |
| `R2_PUBLIC_MEDIA_ACCESS_KEY_ID`, `R2_PUBLIC_MEDIA_SECRET_ACCESS_KEY`, `R2_PUBLIC_MEDIA_STAGING_BUCKET_NAME`, `R2_PUBLIC_MEDIA_BUCKET_NAME` | distinct media buckets | separate private upload and public product-media buckets, media-scoped credentials | separately approved production buckets |
| `PUBLIC_MEDIA_BASE_URL` | current `r2.dev` is development-only | approved HTTPS custom-domain **origin** on public media bucket only | approved HTTPS custom-domain origin; never `r2.dev` |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | optional local setup | omit sending key until isolated data, verified sender, approved recipient and controlled test | production sender/key after rotation and launch approval |
| `OUTBOX_WORKER_SECRET` | local secret | separate staging secret, same value in app and scheduled Functions | distinct production secret |
| `ORDER_EXPIRATION_ENABLED`, `PAYMENT_RECONCILIATION_ENABLED`, `ORDER_MAINTENANCE_DATABASE` | absent/off locally | flags `false` initially; database name must equal dedicated staging DB before enabling | separate production decision and database confirmation |

The return URL builder adds the provider `order_id` query parameter. Its base is the complete `/checkout/return` URL, while `APP_URL` and `BETTER_AUTH_URL` are origins. Cashfree notification URL is derived from the return URL's HTTPS origin; it is absent for local HTTP. Google Cloud Console > Google Auth Platform > Clients must list the exact staging origin and the Better Auth callback URI for the approved staging client (expected path `/api/auth/callback/google`; confirm the actual redirect in the staging sign-in flow). Do not add staging callbacks to an unrelated production client without owner review.

Staging email isolation correction: the server environment validator previously treated `APP_URL` alone as a request to enable Resend, making a required staging URL depend on an email API key. It now allows `APP_URL` without Resend credentials. Supplying either `RESEND_API_KEY` or `EMAIL_FROM` still requires the other and `APP_URL`. This permits a valid HTTPS staging runtime with email delivery unconfigured until a controlled test. Focused environment tests **17/17 PASS**; application/test TypeScript, focused ESLint and `git diff --check` PASS. No email was sent.

Additional local regressions: outbox tests **9/9 PASS** and Netlify scheduled-worker tests **5/5 PASS**, with no provider send. These tests do not establish deployed schedule execution or real email delivery.

## Netlify preparation and safe data boundaries

`package.json` uses Next.js 16.4.6; its installed package requires Node >=20.9.0. Local Node is 24.18.0. `netlify.toml` schedules `process-outbox` and `expire-orders` every 15 minutes; it does not pin a Next adapter or specify build/publish settings. Netlify's current OpenNext adapter supports App Router, Route Handlers and Cache Components automatically. In Netlify Dashboard, verify the site is detected as Next.js, build command `npm run build`, publish directory `.next`, and a Node version compatible with the installed package (24 matches this local runtime). Do not add a legacy pinned adapter. Review build logs to confirm the adapter and generated functions. [Netlify Next.js adapter](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [Node build selection](https://docs.netlify.com/build/configure-builds/manage-dependencies/).

In Netlify Dashboard > Project configuration > Environment variables, set staging-only values with **Builds** scope where build-time URL/configuration is needed and **Functions** scope for server routes and scheduled workers. Never put secrets in `netlify.toml`, `NEXT_PUBLIC_` variables, or a repository `.env` file. Environment changes require a new deploy. The worker functions call only their validated same-origin HTTPS `APP_URL` with `OUTBOX_WORKER_SECRET`; the internal endpoint verifies the bearer secret. The outbox schedule has no feature flag in `netlify.toml`: a **published** staging site will invoke it. Therefore use an empty, isolated staging database and keep real customer email addresses and production Resend credentials out of staging. Leave `RESEND_API_KEY` unset until a separately approved controlled email test. The order-maintenance function returns without work while both flags are false. Its database confirmation must match staging before either flag is enabled. Worker HTTP calls have 25-second timeouts; Netlify documents a 30-second scheduled-function limit, so deployed duration must be observed. [Netlify Functions environment](https://docs.netlify.com/build/functions/environment-variables/), [scheduled-function behavior](https://docs.netlify.com/build/functions/scheduled-functions/).

Netlify scheduled functions run automatically only on a **published deploy**. A branch Deploy Preview will not prove their schedule; a dedicated staging site with its own published staging deploy is needed for automatic schedule verification. Netlify Dashboard > Functions should show both functions as Scheduled with a next run and logs after that site is published. Do not use Run now or enable maintenance/email before the owner approves the isolated staging data and worker configuration. `next.config.ts` defines `nosniff`, frame denial, referrer, permissions, conditional one-day HTTPS HSTS and `private, no-store` on protected paths. Verify the deployed response headers; local source is not deployment evidence.

## Production-like runtime gate

Prior local `next build` generated 53/53 pages. `next start` was blocked because the current product-media URL uses `r2.dev`, which the production environment rejects. A legitimate runtime smoke requires the approved staging HTTPS `APP_URL`, matching `BETTER_AUTH_URL` and full Cashfree return URL, an HTTPS public-media **custom domain already verified on the correct public bucket**, isolated database and provider credentials, and Netlify build/runtime scopes. There is no approved staging host or Cloudflare permission evidence in this session, so no production-like start or deploy was attempted. Do not use a fabricated hostname, loosen validation, or expose a private bucket to pass the check.

## Ordered staging verification after owner configuration

1. Public homepage and catalogue; 2. normal-browser Google login/logout; 3. customer/admin authorization; 4. Cashfree sandbox checkout; 5. verified success confirmation; 6. failed/expired confirmation; 7. conclusive claim release and deliberate retry; 8. signed public HTTPS Cashfree webhook; 9. reconciliation with the browser closed; 10. purchased PDF entitlement; 11. authenticated watermarked PDF download; 12. My Library and Order History updates; 13. consultation booking; 14. one approved Resend outbox email; 15. scheduled worker invocation/logs; 16. deployed security headers; 17. basic performance/accessibility. Use only approved staging identities and sandbox transactions. Verify the historical failed order separately under its existing guarded recovery procedure; do not mutate it during staging preparation.

## Owner dashboard checklist, in priority order

| Dashboard location | Verify or configure | Safe result | Gate and risk |
|---|---|---|---|
| Cloudflare > R2 Object Storage > each bucket > Settings > Public Development URL and Custom Domains | Inspect private PDF, private media staging, public product-media buckets independently | Private buckets have no public URL/domain; only approved media bucket may have custom domain | **Blocks staging**; wrong setting exposes private PDFs |
| Netlify > Project configuration > Environment variables | Create isolated staging site/context and scoped values from matrix | No production secrets/data in staging; Functions scope present | **Blocks staging**; wrong scope or context can reach production systems |
| Netlify > Project configuration > Developer settings > Continuous deployment > Build settings / Dependency management | Confirm Next build, `.next`, compatible Node and automatic adapter | Build and Functions use compatible runtime | **Blocks staging** if runtime cannot start |
| Google Cloud Console > Google Auth Platform > Clients | Register exact staging OAuth origin and callback on nonproduction client | Sign-in returns only to staging | **Blocks staging auth**; wrong callback leaks or breaks sign-in |
| Cashfree sandbox dashboard > API credentials / Webhooks | Use sandbox keys, version and staging webhook URL only | No live charge path; signed webhook reaches staging | **Blocks payment staging**; production keys could create live charges |
| Resend Dashboard > Domains and API keys | Verify sender; rotate prior exposed key, then authorize one controlled test inbox | No unintended customer email | **Blocks email test/public launch**; real email/secret exposure risk |
| Netlify > Functions after published staging deploy | Inspect scheduled badge, next run and logs; enable maintenance only after DB review | Bounded jobs target staging DB only | **Requires staging**; wrong database could mutate records |

Public commercial launch remains separately blocked by GST/tax approval, seller identity, approved privacy/refund/terms and grievance details, consultation cancellation/rescheduling policy, secret rotation, Atlas network-access strategy and any unresolved payment/entitlement defect. Phase 21 real paid-to-PDF, failure/retry, authenticated browser and Mongo concurrency checks remain unverified. **Phase 22A preparation is complete; Phase 22B and deployment require a separate owner decision.**
