# MoneyTreeVentures — Deployment and Payment Environments

**Status:** Planned deployment runbook. No Netlify site, DNS, Cashfree, database, or R2 configuration has been performed. This document is not authorization to deploy or change DNS.

The application now includes the Phase 4 Cashfree, R2 PDF fulfilment, and booking workflows. No live provider credentials, external requests, object uploads, payment orders, webhook registrations, deployments, or DNS changes have been configured or used from this workspace. The runbook below describes the owner-operated setup and checks still required.

## Hosting choice and account ownership

Use the client's Netlify Free team/site and a **public repository owned by the client's personal GitHub account**. The client explicitly approved public visibility of the full source, including backend code. Assume anyone can read, clone, and retain every committed file and Git-history revision. Public source must never contain credentials, customer information, private product masters, production database exports, generated buyer PDFs, or other restricted material. The client must own Netlify, GitHub, GoDaddy, Cashfree, Atlas, Cloudflare/R2, and Resend accounts. Netlify's Acceptable Use Policy permits hosting third-party sites while prohibiting resale of Netlify as standalone hosting without a written agreement. [Netlify Acceptable Use Policy](https://www.netlify.com/legal/acceptable-use-policy/)

Netlify Free currently includes 300 credits per month with a hard limit and no auto-recharge. Production deploys use 15 credits each; deploy previews, branch deploys, and failed deploys are non-metered. Metered traffic/function resources also use credits. The credit pool is shared across the team's web projects; at exhaustion, all projects pause, visitors receive an unavailable page, and new production deploys stop until the reset or plan upgrade. Monitor the team's credit balance and project usage. Free is a cost-conscious launch choice, not an uptime guarantee. Recheck current terms and limits before launch. [Credit plan table](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [what happens at the credit limit](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/)

### Free-plan Git and access constraints

Netlify supports public repositories on the Free plan, including organization-owned public repositories; this project will use the client's personal-account public repository. Netlify Free is single-seat. The client is the Team Owner and controls the site dashboard, environment variables, deploy settings, and domain settings. Additional team roles/direct private-project access require an upgrade. The developer can contribute through GitHub permissions granted by the client; do not share the owner's login. Repository access controls who can push/merge and thereby trigger Git-based deploys, so protect the production branch and review changes before merging. Public repository contributions and pull requests must be treated as untrusted; never provide production secrets to deploy previews. [Git repository support](https://docs.netlify.com/build/git-workflows/overview/), [project visibility and seats](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/)

## Pre-publication security checklist

Complete this checklist and record the review before changing the repository to public. A public Git repository exposes all present and historical committed contents; deleting a secret in a later commit does not remove it from history. If a credential is found, revoke/rotate it first, then remove it from all affected history before publication.

- Run an established secret scanner (for example, Gitleaks) against the working tree **and all Git history**. Review findings manually; scan source, docs, configuration, lockfiles, and ignored/untracked files intended for publication. Confirm findings are placeholders or false positives, not real credentials.
- Inspect all refs and commits, including branches/tags, for accidentally committed `.env` files or secrets. Verify the intended publication branch and repository history are the complete history being reviewed.
- Confirm `.gitignore` excludes `.env*` while explicitly allowing only the safe `.env.example`; verify with `git check-ignore` that `.env.local` is ignored and `.env.example` is not. Inspect every environment example and ensure it contains placeholders only.
- Review all tracked and untracked files staged for publication. Exclude private PDF masters, personalized PDF copies, customer/order exports, production database dumps, logs, backups, credentials, certificates, and private operational records.
- Review third-party dependency licenses in `package.json` and `package-lock.json` with an appropriate license inventory tool or manual process. Resolve incompatible or unclear license terms before publication; do not assume an installed package's license from its name alone.
- Confirm no secret is prefixed `NEXT_PUBLIC_`, embedded in client bundles, committed to a Netlify config file, or placed in pull-request preview contexts. Enter actual values only through the client-owned Netlify environment-variable UI/API, separately per context.
- Confirm the client has reviewed and approved the exact repository contents and the public-source implications. Public Git history cannot be made confidential again merely by switching visibility later.

**Current review status:** `.gitignore` excludes `.env*` and permits `.env.example`; the currently present `.env.example` uses safe-looking placeholders. A basic token-pattern heuristic was run against the one existing Git commit and the current non-generated worktree with no matches. This is not a comprehensive secret scan, does not replace Gitleaks/history review, and does not verify all files or dependency licenses. The repository is **not yet certified safe to publish**; complete and record every checklist item before the client makes it public.

## Git-integrated deployment workflow

1. Client creates/owns the public GitHub repository under their personal account only after completing the pre-publication security checklist and approving the exact contents. Do not commit `.env`, secrets, private PDF masters, customer data, production exports, or generated customer copies.
2. Client signs in to Netlify and imports the existing repository using **Add new project → Import an existing project**. Authorize the Git provider and choose the repository. Netlify detects Next.js and its build settings; use the maintained OpenNext adapter that Netlify configures automatically. Do not add a manually pinned adapter version unless a compatibility issue is demonstrated. [Import existing project](https://docs.netlify.com/manage/projects/add-new-project/), [Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
3. Set the production branch (planned: `main`) and enable deploy previews for pull requests. Create a `staging` branch and enable its branch deploy. Protect `main` in GitHub with reviewed pull requests and required checks before merge. Limit write access to trusted contributors; public visibility does not imply permission to push. The client controls who can merge deploy-triggering changes.
4. Push/merge to `staging` to build the staging branch deploy, then run the deployment checklist below. A reviewed merge to `main` triggers the production deployment. Netlify builds on pushes and retains deploy history; use Netlify's deploy UI to inspect build output and roll back to a prior deploy if needed. [Git workflows](https://docs.netlify.com/build/git-workflows/overview/)
5. For every deploy, review the build status and run the relevant smoke checks. A failed build does not become production. Production deploys consume the plan's credits even if later rolled back; account for the 15-credit production deployment charge.

Netlify's maintained OpenNext adapter documents support for App Router, SSR, Route Handlers, and Cache Components. Preserve the existing Next.js 16.4.6 App Router and `next.config.ts` Cache Components configuration. Let Netlify update the adapter automatically; do not unnecessarily pin its version. Test the real production build/deploy because framework support does not prove this application's routes and cache behavior are correct. [Next.js feature support](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)

## Environment separation

Use the same variable names with separate values in each context. Add hosted secrets through the client's Netlify UI/API, not `netlify.toml` or Git. Netlify Free supports deploy-context values but environment-variable scopes (such as restricting a secret to Functions only) are a Pro/Enterprise feature. Therefore never make secret variables available to browser code, never prefix secrets with `NEXT_PUBLIC_`, and ensure server modules alone read Cashfree, MongoDB, R2, Better Auth, and Resend credentials. Keep production secrets out of staging and all deploy-preview contexts. Do not trust code from public pull requests with any credentials. Configure context values deliberately and verify the built client bundle contains no secrets. [Netlify environment variables](https://docs.netlify.com/build/environment-variables/overview/)

The application configuration schema, required/optional variables, local setup, and validation behavior are documented in [ENVIRONMENT.md](./ENVIRONMENT.md). The homepage has no required environment variables. Google authentication requires Better Auth secret/origin, both Google OAuth values, and MongoDB in that environment. Keep credentials in the matching local/staging/production server context only.

| Context | URL/source | Cashfree | MongoDB / R2 | Notes |
|---|---|---|---|---|
| Local | `http://localhost:3000`, `.env.local` | Sandbox only | Local/test database; isolated private test bucket only if needed | `.env.local` is ignored by Git. `.env.example` contains safe placeholders only. |
| Deploy Preview | Pull request URL | No credentials by default; sandbox-only credentials only when explicitly needed | No production access; test database and test bucket only | Treat previews as non-production. Do not use production customer data. |
| Staging branch deploy | `https://staging.moneytreeventure.com` (after separately approved DNS work) | Sandbox only | Dedicated staging/test database and separate private staging bucket/token | Use `Branch: staging` context values and staging `APP_URL`/callback URLs. |
| Production | `https://moneytreeventure.com` | Client's production merchant account | Production database and separate private production bucket/token | Production credentials exist only in Production context; access limited to authorized owner. |

Production and staging use distinct Cashfree credentials/modes, callback URLs, webhook registrations, database resources, R2 buckets/tokens, Better Auth secrets/base URLs, Google OAuth client configuration, and email sender configuration. Prefer separate Atlas databases and separate R2 buckets; never point staging at production data. Production alone receives live Cashfree credentials. Set `BETTER_AUTH_URL` and `APP_URL` per context. Add the exact authorized Google redirect URI for each active environment: local `http://localhost:3000/api/auth/callback/google`; staging and production use their own `https://<origin>/api/auth/callback/google`. Production/staging Google callbacks still require owner configuration in Google Cloud Console. Cashfree and Better Auth secrets stay server-side in all contexts. The Phase 2.5 Cashfree client chooses sandbox or production base URL only from `CASHFREE_ENVIRONMENT`; do not put one environment's keys in the other context.

## R2 and Cashfree provider notes

- Keep every R2 bucket private. Create separate least-privilege tokens and buckets for staging and production. Set `R2_ENDPOINT` to the HTTPS endpoint for the same account ID; the R2 configuration rejects an endpoint host mismatch. `R2_REGION` is normally `auto`. Never create public object URLs for master or personalized PDFs.
- R2 uses the AWS SDK v3 S3 client and presigner. Uploads are bounded by `R2_MAX_UPLOAD_BYTES` (25 MiB default, 100 MiB maximum), checked for `.pdf`, `application/pdf`, and the leading `%PDF-` signature, and require asset/product/version metadata. This is not malware scanning or full PDF validation. Generated object keys use `masters/{assetId}/versions/{uuid}.pdf` or `personalized/{entitlementId}/{uuid}.pdf` and contain no customer email/name. Keep master files immutable by writing new version keys.
- Signed downloads default to `DOWNLOAD_URL_TTL_SECONDS` (60 seconds, hard maximum 900). A signed URL is a bearer credential that remains usable until expiry, even after an entitlement is revoked. The current download handler authenticates the customer, verifies owner-scoped active entitlement and ready personalized copy, rate-limits and logs the request, then issues a short-lived URL. Never log or expose the URL outside the customer response.
- Cashfree uses `https://sandbox.cashfree.com/pg` or `https://api.cashfree.com/pg` according to `CASHFREE_ENVIRONMENT` and sends the configured `x-api-version`. Hosted Checkout, server-side payment verification, idempotent raw-body webhook handling, full refunds, and refund status reconciliation are implemented. Production return URLs require HTTPS; HTTP is allowed only for localhost/loopback in development. The webhook Route Handler is `/api/webhooks/cashfree`.
- No live Cashfree or R2 provider verification was performed in this workspace. Use sandbox credentials and a separate private test bucket for staging checks. Keep all credentials out of source control and server-only. Importing provider modules does not itself issue a provider request.

R2 endpoint and presigned URL behavior follow Cloudflare's [S3 compatibility guide](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) and [presigned URL documentation](https://developers.cloudflare.com/r2/api/s3/presigned-urls/). Cashfree environment base URLs and API versions follow its [current endpoint reference](https://www.cashfree.com/docs/api-reference/payments/latest/overview); the `x-client-id` and `x-client-secret` headers follow its [merchant authentication guide](https://www.cashfree.com/docs/api-reference/authentication).

## GoDaddy DNS, canonical host, and HTTPS

The client retains domain registration and DNS management at GoDaddy. Domain ownership/registration is not transferred to Netlify. GoDaddy DNS records can point the domain to Netlify while GoDaddy continues as registrar and DNS provider; changing nameservers to Netlify DNS is not required. The production canonical host is `moneytreeventure.com`; `www.moneytreeventure.com` must permanently redirect to it. `staging.moneytreeventure.com` is assigned only to the staging branch deploy/site.

When the client later authorizes domain connection, the sequence is:

1. In the correct Netlify project, add the production apex and `www` domain, set the canonical production domain, and add staging to the intended staging deployment.
2. Open Netlify's **Domain management → Production domains → Pending DNS verification** details for each hostname. Copy the exact project-specific records and verification instructions shown there. DNS targets can depend on project/platform configuration; this runbook intentionally does not state record names or values.
3. In GoDaddy DNS, review existing website and mail records. Apply only the Netlify-provided records, preserving MX, SPF, DKIM, DMARC, and unrelated records. Do not transfer the domain or change nameservers. Allow DNS to propagate.
4. Wait for Netlify to validate each domain and provision its managed HTTPS certificate. Netlify certificates are automatically renewed. Then test HTTPS for apex, `www`, and staging.
5. Configure/verify the permanent `www` → apex redirect using Netlify's domain settings or an application redirect after the implementation approach is approved. Confirm the redirect is one-hop and has no loop; verify the apex is canonical. Keep staging out of search indexing.

Adding the domain to a Netlify site and entering DNS records are both future deployment actions and have not been performed. No DNS values should be inferred from examples or this document. [External DNS instructions](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/), [Netlify domain setup](https://docs.netlify.com/manage/domains/get-started-with-domains/), [HTTPS certificates](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/), [GoDaddy DNS management](https://www.godaddy.com/help/manage-dns-records-680)

## Cashfree endpoints and production secrets

Cashfree Hosted Checkout is the only payment gateway. Sandbox uses test credentials and test payments; production uses the client's merchant account. The planned webhook path is `/api/webhooks/cashfree`:

- Staging sandbox webhook: `https://staging.moneytreeventure.com/api/webhooks/cashfree`.
- Production webhook: `https://moneytreeventure.com/api/webhooks/cashfree`.

Register a webhook only after its route exists and its corresponding host is verified. Configure the correct version and distinct sandbox/production signing secret in Cashfree. Verify signatures against the original raw request body. Never put Cashfree secrets in client code, logs, Git, `.env.example`, deploy preview values, or frontend success handling. A successful browser return never grants an entitlement.

## Deployment verification checklist

Run this checklist after implementation in local/staging first. Retain sanitized test evidence; do not record secrets, payment sessions, signed URLs, or unnecessary customer PII. No items below have been run as part of this documentation update.

1. **Next.js production build:** run the repository production build command; confirm Next.js 16.4.6 completes cleanly under the Netlify build environment and the maintained adapter without a manually pinned adapter.
2. **App Router and server rendering:** exercise representative static and server-rendered routes; confirm dynamic output, streaming where used, error/not-found handling, and no private data in shared caches.
3. **Cache Components:** preserve and verify the existing `cacheComponents` setting; confirm public cache and tag/path revalidation behavior after deploy on Netlify.
4. **API Route Handlers:** call implemented handlers with valid/invalid inputs; confirm expected Node runtime, status codes, validation, authorization, and no accidental caching.
5. **Cashfree webhook:** send a signed sandbox event to the deployed endpoint; verify raw-body signature validation, idempotency, duplicate delivery, and invalid-signature rejection. Do not use a production payment for smoke testing.
6. **MongoDB connection:** confirm the environment connects only to its designated Atlas database, reuses connections appropriately, and performs a transaction-capable test without leaking URI values.
7. **Cloudflare R2 connection:** check the intended private bucket with least-privilege server credentials; confirm no public bucket/object access and no credentials in logs or browser bundles.
8. **PDF watermark generation:** use an approved test master; verify the master remains unchanged and the generated copy contains the subtle buyer/order/date watermark and approved personal-use notice. Check runtime/memory limits and retry idempotency.
9. **Secure PDF downloads:** verify active entitlement and owner checks, short-lived URL expiry, rate limiting, download-request logging, and rejection of another user's copy. Confirm no raw R2 object key alone grants access.
10. **Environment isolation:** inspect Local, Deploy Preview, `Branch: staging`, and Production context values. Confirm staging/local use Cashfree sandbox and non-production data; confirm production values never enter previews/client bundles. Specifically ensure no `NEXT_PUBLIC_` secrets.
11. **Custom domain and HTTPS:** only after approval to connect the domain, verify the exact Netlify-provided GoDaddy records, certificate issuance/renewal status, HTTPS on apex/www/staging, canonical apex, and permanent `www` redirect. Do not change DNS as part of this documentation task.
12. **Credit and rollback readiness:** confirm credit monitoring, calculate production deploy and bandwidth/function usage, document what to do before reaching the hard limit, and rehearse deploy rollback without switching production credentials to sandbox.

## Administrator access operations

- `/admin` performs a server-side session/profile authorization check before rendering its content. Anonymous visitors are sent to `/login`; signed-in non-admin, blocked, or deleted profiles get a safe forbidden page. Every future admin API Route Handler should use `withAdmin()` and enforce authorization again at its service/data access boundary.
- Google sign-in provisions a `customer` profile. **Phase 0 security notice:** the existing `admin:bootstrap` command promotes by user ID and active profile only; it does not enforce the required verified Google address `moneytreeventuress@gmail.com`. Do not use it to grant administrator access until the allowlist and verified-email checks are implemented and tested. The future `/admin/login` entry point must reuse Better Auth and must not replace its OAuth callback.
- Never run bootstrap during Netlify build/deploy, from an HTTP endpoint, against an unverified user ID, or against the wrong environment. It requires MongoDB transaction support; failures must be resolved before retrying. Do not print or paste environment values into logs/support requests.
- Staging and production environment variables remain isolated in their Netlify contexts. A bootstrap must target only the explicitly selected environment. No promotion, deployment, or production credential configuration was performed by Phase 3.4.

## Payment-to-download sandbox acceptance

The following payment integration tests remain separate from the hosting smoke checks. Run them only after the application integration exists:

- Verify immutable order snapshots and INR amounts; test success, pending, failure, interruption, mismatch, duplicate, and out-of-order webhook cases.
- Verify only a signed, exact successful Cashfree payment creates the correct PDF purchase entitlement or separate Call Guidance booking entitlement.
- Verify PDF personalization, private storage, owner authorization, download logging/rate limits, full-refund revocation, audit events, and no PDF fulfilment for Call Guidance.
- Verify durable email outbox retries and that email failures do not undo payment fulfilment.

No live payment or refund is authorized by this document. A production low-value transaction requires explicit client approval at the time it is proposed.

## Controlled production launch and rollback

- Confirm legal/tax configuration, real catalogue content/prices/files, watermark notice, booking instructions, support information, and refund policy.
- Confirm Netlify Free eligibility, Git provider/repository owner type, production branch, credit usage, account ownership/access, and rollback contact.
- After separate approval, connect GoDaddy DNS using the exact Netlify project records; preserve mail records and verify HTTPS/canonical redirects.
- Confirm separate staging/production environment values, Cashfree modes, Atlas databases, R2 buckets, callback URLs, and webhook registrations.
- Confirm Cashfree merchant onboarding, settlement account, transaction fees, and taxes. Production credentials are entered by the client through Netlify's protected environment configuration.
- Verify monitoring, backups/restore plan for Atlas tier, outbox replay, incident response, and hosting-credit exhaustion response.

Rollback to a known-good Netlify deploy without switching production to sandbox or changing database/storage secrets. For uncertain payment status, withhold access and reconcile with Cashfree before retrying fulfilment. Production payment/refund actions require separate client authorization.
