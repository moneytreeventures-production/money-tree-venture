# MoneyTreeVentures — Environment Configuration

**Status:** Phase 2.1–2.5 infrastructure, Phase 3.1–3.2 Better Auth and Google OAuth, and Phase 3.4 server-side admin authorization/bootstrap foundation. The homepage does not require credentials; `/api/auth/*` and protected server sessions require auth, Google, and MongoDB configuration.

## Current requirements

The current homepage and design system require **no environment variables**. Next.js supplies `NODE_ENV` for its normal commands; the parser accepts `development`, `production`, or `test` and defaults to `development` when called outside Next.js. `APP_URL` is optional and, when supplied, must be an absolute HTTP or HTTPS URL.

No database, authentication, Cashfree, R2, Resend, email, or worker credentials are globally required. MongoDB, authentication, and Resend retain all-or-nothing group validation. Cashfree and R2 values are checked individually when supplied, while completeness is checked only when their server-only configuration/client accessor is requested. This lets an unrelated homepage continue working if an integration is absent or only partly prepared; the first operation for that provider fails with a safe configuration error if required values are missing. A malformed supplied value can still fail environment validation at startup.

## Variable reference

All values below are server-side. There are currently **no variables intentionally exposed to the browser** and no `NEXT_PUBLIC_` variables in the schema.

| Variables | Purpose and validation | Current status |
|---|---|---|
| `NODE_ENV` | Next.js runtime mode: `development`, `production`, or `test`. | Supplied by Next.js; defaults to development if absent. |
| `APP_URL` | Optional application origin; must be an absolute HTTP(S) URL. | Optional; no current feature requires it. |
| `MONGODB_URI`, `MONGODB_DB_NAME` | MongoDB connection URI (`mongodb://` or `mongodb+srv://`) and database name. Required together if either is supplied. | Optional until `connectToDatabase()` is called by a database feature; see [DATABASE-DESIGN.md](./DATABASE-DESIGN.md). |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Better Auth signing/encryption secret (at least 32 characters) and root origin URL. Required together when either is supplied. Production requires HTTPS; development/test may use HTTP only for localhost/loopback. | Optional for the homepage; required when `/api/auth/*` is used. Secrets are never exposed to clients. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Web OAuth client ID and secret. Validated together; used only by the server-side Better Auth config. | Required with Better Auth and MongoDB when using Google sign-in. Never prefix with `NEXT_PUBLIC_`. |
| `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_ENVIRONMENT`, `CASHFREE_API_VERSION`, `CASHFREE_WEBHOOK_VERSION`, `CASHFREE_RETURN_URL_BASE` | Cashfree credentials, `sandbox`/`production` selector, real calendar-date versions, and return URL. All six are required when the client is requested. Production requires HTTPS; development permits HTTP only for localhost/loopback. | Optional until requested. A lazy server-only REST client exists; no checkout, order, payment, refund, or webhook workflow exists. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_REGION` | Private Cloudflare R2 account/access configuration and exact HTTPS endpoint `https://<account-id>.r2.cloudflarestorage.com`. The five credential/bucket/endpoint values are required when storage is requested. Region defaults to `auto`. | Optional until requested. Lazy private PDF storage adapter exists; no live connection occurs during import/build. |
| `R2_MAX_UPLOAD_BYTES` | Integer upload limit from 1 byte to 100 MiB; defaults to 25 MiB. | Used by the reusable PDF upload validator. |
| `RESEND_API_KEY`, `EMAIL_FROM` | API key and valid sender email (optionally in `Name <email>` form). Required together when either is supplied. | Reserved for a later email phase; no email is sent. |
| `SUPPORT_EMAIL` | Optional contact email address. | Optional; no current feature requires it. |
| `OUTBOX_WORKER_SECRET` | Optional worker credential; if supplied, minimum 32 characters. | Reserved for a later background-processing phase. |
| `DOWNLOAD_URL_TTL_SECONDS` | Optional integer from 1 through 900 seconds; defaults to 60. | Default signed R2 download URL expiry; 900 seconds is the hard maximum. URLs are bearer credentials until expiry. |

`R2_PUBLIC_URL` is deliberately not included: the approved design uses private R2 objects and short-lived server-generated signed URLs. Do not add a public bucket URL unless the storage design is explicitly changed. R2, Cashfree, and Better Auth accessors live in server-only modules and initialize lazily; importing them does not contact external services or open a database connection. R2 credentials, Cashfree client ID/secret, Better Auth secret, and internal auth configuration must never be returned to a browser component or API response.

## Phase 3.1–3.2 Better Auth and Google OAuth

`src/lib/auth/auth.ts` is the single server-only Better Auth instance. It validates the auth configuration before using the database, then calls the existing `connectToDatabase()` function and passes Mongoose's already-connected native `Db` and `MongoClient` to the official `@better-auth/mongo-adapter`. This reuses the established MongoDB pool; it does not create another `MongoClient`. The adapter uses the client-backed transaction mode supported by MongoDB replica sets such as the planned Atlas deployment.

The API is mounted at `/api/auth/[...all]` using Better Auth's official Next.js `toNextJsHandler` integration and the default Node.js runtime. No explicit `runtime` segment export is used because Next.js Cache Components requires the default Node.js runtime. Only GET and POST are exported. The homepage works without Better Auth or MongoDB configuration; a request to the auth API returns a safe configuration error if `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, either Google credential, or database configuration is missing. No API key, secret, or raw database error is included in that response.

Use a newly generated random secret of at least 32 characters for each environment. Development uses `BETTER_AUTH_URL=http://localhost:3000`; its Google callback URI is `http://localhost:3000/api/auth/callback/google`. Production and staging use their exact HTTPS origin, without a path, query, or fragment, and each Google OAuth client must list its matching `https://<origin>/api/auth/callback/google` redirect URI. Cookie defaults are HttpOnly and SameSite=Lax; Secure is enabled in production. Better Auth warning/error events go through the structured app logger using generic messages and error names only; raw internal messages and error diagnostics are not copied into application logs. Email/password is disabled. Google requests only `openid`, `email`, and `profile` scopes.

Better Auth owns authentication identity/account/session records in `authUsers`, `authAccounts`, `authSessions`, and `authVerifications`. The existing Mongoose `users` collection remains the application profile and authorization source. A Better Auth user-create hook provisions a profile with an idempotent `authUserId` upsert and `customer` role; a later server-side customer lookup retries provisioning if needed. Existing role/status values are preserved, profiles are never matched by email, and blocked/deleted profiles are rejected. The unique profile index must be applied in MongoDB for concurrent upserts; the auth and profile writes are not one cross-collection transaction. Better Auth may create its own collections and indexes when its adapter first handles a database request; no live MongoDB initialization or index creation was run in this task.

Server helpers validate sessions with Better Auth `auth.api.getSession()` and Next.js `headers()`. Client-side `useSession()` is display state only; protected server operations must use `requireCustomer()` and must not trust browser identity or role fields. Sign-out uses Better Auth's session revocation endpoint.

### Phase 3.4 administrator bootstrap

The admin bootstrap command uses the same MongoDB and Better Auth collections as the application. Locally it loads `.env.local` through Next.js's environment loader; in a controlled remote operation, provide the selected environment's server-side variables through the operator's secure shell. It does not need a new credential or environment variable. Do not add an admin email, role, or confirmation secret to configuration.

After the intended person has signed in with Google and the active `users` profile exists, verify the exact Better Auth user ID from the private `authUsers` collection, then run `npm run admin:bootstrap -- --user-id <BETTER_AUTH_USER_ID> --confirm-promote-admin`. The explicit confirmation flag is mandatory. The command does not run on build/deploy and must not be run against production without the project owner's explicit operational approval. It records the role change in `auditLogs` in the same MongoDB transaction. See [DATABASE-DESIGN.md](./DATABASE-DESIGN.md) for the data guarantees.

## Phase 2.5 provider configuration

R2 uses the Cloudflare account-specific S3 endpoint, AWS SDK v3, and region `auto`. The bucket remains private. Endpoint host and account ID must match. R2 upload validation requires a safe `.pdf` filename, a UUID-based key shaped as `masters/{assetId}/versions/{uuid}.pdf` or `personalized/{entitlementId}/{uuid}.pdf`, an `application/pdf` content type, a `%PDF-` file signature, bounded bytes, and asset/product/version metadata. The signature check is a lightweight format check only; it is not malware scanning or complete PDF validation. New master and personalized object keys use a random UUID so normal uploads never overwrite the original master. The generic delete operation exists for future lifecycle code; current business code must preserve purchased and source masters unless a separately approved lifecycle policy permits deletion.

Signed R2 URLs default to `DOWNLOAD_URL_TTL_SECONDS`, bounded to 15 minutes. They are bearer credentials, can be used by anyone holding the URL until expiry, and cannot be permanently revoked by entitlement changes after issuance. A future download handler must authenticate the customer, verify ownership/active entitlement, rate-limit and audit the request before generating a URL. This foundation does not implement that handler or authorization.

Cashfree client configuration selects exactly one API base URL from the explicit environment: sandbox uses `https://sandbox.cashfree.com/pg`, and production uses `https://api.cashfree.com/pg`. There is no cross-environment fallback. Use the Cashfree supported `x-api-version` value approved for the merchant integration; the current API documentation lists `2026-01-01` as latest. The client sends Cashfree's merchant authentication headers only from server-side code. A configured return URL must be HTTPS in production; development may use localhost/loopback HTTP. The client is server-only and lazy, and credentials are held in private fields. It has no order/checkout/refund service calls or webhook endpoint in this phase. Merchant onboarding and correct environment-specific credentials remain prerequisites. See Cashfree's [current API version/endpoints](https://www.cashfree.com/docs/api-reference/payments/latest/overview), [authentication guidance](https://www.cashfree.com/docs/api-reference/authentication), and Cloudflare's [AWS SDK v3 setup](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).

## Local setup

Put the Google OAuth Web client ID and secret in the ignored `.env.local`; do not paste them into prompts or commit them. In Google Cloud Console, register `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Configure `BETTER_AUTH_SECRET` (random, at least 32 characters), `BETTER_AUTH_URL=http://localhost:3000`, and both MongoDB variables as well. Authentication requires MongoDB to be reachable. `.env.example` contains placeholders only.

The homepage works without an environment file. To prepare a local file for later integration work, copy the safe template at the repository root:

```powershell
Copy-Item .env.example .env.local
```

The template contains placeholder values to show each variable's expected shape. These values are not working credentials. Remove or comment out integration groups that are not being configured; when enabling a group, replace its placeholders with complete local sandbox/test values. Never use production credentials locally. `.env.local` is ignored by Git. `.env.example` is the only environment file intentionally allowed in Git and must contain placeholders only.

Next.js loads `.env*` files from the repository root, including when application source is in `src/`. The environment parser does not implement its own file loader; it reads `process.env` after Next.js has loaded the environment.

## Validation and server/client boundary

`src/lib/env/schema.ts` defines the Zod schema, inferred `ServerEnv` type, and redacted `parseServerEnv` function. Validation errors identify variable names and constraints but never include the rejected values. `src/lib/env/server.ts` is the central lazy accessor, `getServerEnv()`. `src/instrumentation.ts` calls it at Node server startup, so invalid supplied values fail before serving requests; no integration values are required when their groups are absent. The accessor itself validates on first use rather than module import. The schema and accessor import Next.js's `server-only` marker so a Client Component cannot import them without a build-time error.

The application currently has no public environment configuration. The parser rejects any configured `NEXT_PUBLIC_*` variable until an explicit browser-safe allowlist is designed. Never prefix a secret with `NEXT_PUBLIC_`; Next.js inlines those values into browser JavaScript during builds. If a future browser-visible setting is needed, define a separate explicit allowlist containing only non-secret values and keep it isolated from `server.ts`.

Missing integration settings remain optional until a feature configures and uses that integration. Once a group is partially configured, validation fails with the missing names. Validation is invoked by Node server startup rather than a build-time config import, so unavailable credentials for unimplemented integrations do not break production builds. Invalid configured values are not silently ignored when the Node server starts.

## Netlify environment configuration later

When the client authorizes Netlify setup, configure site variables through the client-owned Netlify environment-variable UI/API, never in Git or `netlify.toml`. Use distinct context values:

- Local development: local database and sandbox/test credentials only.
- Deploy previews: unset credentials by default. Public pull requests are untrusted; do not provide production secrets.
- `Branch: staging`: Cashfree sandbox credentials, staging `APP_URL`/auth callback URLs, staging database, staging private R2 bucket/token, and non-production email settings.
- Production: production URL, database, private R2 bucket/token, verified email sender, and production Cashfree credentials only after the production integration and launch are approved.

Netlify Free supports deploy-context values but not variable scopes that restrict values to Functions. Keep secrets out of browser code, avoid `NEXT_PUBLIC_`, and review built client assets before launch. Never configure real production credentials as part of Phase 2.1. See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment controls and the approval boundaries.
