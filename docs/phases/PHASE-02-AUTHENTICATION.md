# Phase 2 — Google Authentication and Owner-Only Admin Access

**Status: PARTIALLY_VERIFIED.** The implementation and local policy checks are complete. Real owner OAuth, MongoDB-backed session verification, bootstrap, and logout invalidation were not verified because the configured local database connection failed.

## Phase 2.1 update (2026-11-20)

The configured local URI uses an Atlas `mongodb+srv` endpoint and `MONGODB_DB_NAME=moneytreeventures`. The application reads configuration through `getServerEnv()` when MongoDB/auth is first used. Next.js 16 loads root `.env.local` into the Node.js runtime for `next dev`; this is also documented in the installed Next.js environment-variable guide. The project dev command additionally loads `dev-dns.cjs`, which sets DNS servers to Google Public DNS.

A targeted, non-secret endpoint check found that SRV lookups timed out using both the OS resolver and the Google DNS servers. The driver handshake did not complete within the diagnostic window, so no database ping, collection read, or write was made. This establishes DNS/network resolution as the first observed blocker in this execution environment; it does not establish whether Atlas IP access rules, TLS, database credentials, permissions, or the selected database are correct. The `.env.local` database name is not an explicit development/test designation, and `NODE_ENV` is not a safe way to infer which Atlas data it targets. The configured database target therefore remains unclassified and no owner records were queried.

The application's raw Mongo connection failure is deliberately replaced by a sanitized generic `Error` in `src/lib/db/mongodb.ts` at the `mongoose.connect()` catch path. `src/app/api/auth/[...all]/route.ts` logs only the error name. `withAdmin()` logs `admin.api.request_failed` for any non-`ApplicationError`, which includes a Mongo connection error after sanitization. This explains how database failures can produce those events, but the two historical build-time events lack enough request/stack context to prove that they came from MongoDB. Their individual cause remains unresolved; no error was suppressed.

No application code or environment file was changed. No database handshake, authenticated record lookup, Google OAuth, owner bootstrap, or role mutation was completed. The blocker and safe next steps are recorded in [Phase 2.1 verification](PHASE-02-1-VERIFICATION.md).

## Phase 2.3 admin-access blocker update (2026-11-21)

Source inspection confirms the admin page itself is guarded by `AdminGate` in `src/app/admin/layout.tsx`. A request can return HTTP 200 without granting access: the current no-cookie check streamed a meta redirect to `/admin/login`; a signed-in identity that fails authorization receives the restricted-access page with HTTP 200. Neither response establishes that the dashboard was rendered. `/admin` has only the foundation page; its authorized branch is distinguishable by the protected admin navigation.

`/admin/login` sets Better Auth `callbackURL: "/admin"` through the fixed admin intent; the error callback returns to `/admin/login?authError=google`. No callback-path defect was found in source. The authorization policy requires a valid session, verified matching Google identity, exactly one linked Google provider, matching active application profile, and `role: "admin"`; the admin email remains fixed to the approved owner. New profiles default to `customer`, and the owner bootstrap has not been run. Therefore missing role provisioning is the leading explanation, but the actual owner profile and role were not read, so this is not confirmed from database evidence.

The user reported a Next.js instant-navigation validation warning naming `src/app/admin/page.tsx`. The page is synchronous and contains no request/session logic; the request-dependent `AdminGate` lives in the layout behind a `Suspense` fallback. This warning concerns prefetched/navigation UI, not the authorization result. Its exact warning text was unavailable, so its specific cause was not confirmed. No `instant = false` opt-out was added. The owner confirmed the target is non-production, but a fresh read-only DB diagnostic from this execution environment failed at Atlas SRV DNS with `ETIMEOUT` before reading account/session records. No role was changed and no bootstrap was run. See the Phase 2.3 status in [the verification report](PHASE-02-3-ADMIN-ACCESS.md).

## 1. Objective

Enforce the sole approved administrator identity, secure the existing role bootstrap, add `/admin/login`, preserve customer Google sign-in, and provide customer/admin logout controls. No payment, product, catalogue, or deployment work was included.

## 2. Initial findings

Phase 0 found role-only administrator access, profiles defaulting to `customer`, an unrestricted bootstrap by Better Auth user ID, no `/admin/login`, no Admin Login link on `/login`, and no logout on `/account`. Phase 1 recorded that local environment validation passes but actual Google OAuth and MongoDB connectivity are unverified.

The real application profile/role for the owner was not queried. Therefore, this report does not claim that the owner currently has an admin role or can access `/admin`.

## 3. Root cause of missing owner access

New profiles are created with the `customer` role. The prior bootstrap accepted an existing user ID and active profile without checking the linked Google identity or email. The protected area therefore required a separately promoted profile, but the promotion path did not enforce the owner's identity. This describes the source behavior; the owner's actual database record remains unknown.

## 4. Authorization changes

Added a shared server-only identity reader and centralized policy. `getCurrentAdmin()` and `requireAdmin()` now require all of the following:

1. A valid server-resolved Better Auth session.
2. `emailVerified === true` in the session and corresponding Better Auth `authUsers` record.
3. A single linked account record whose provider is `google` (multiple or other-provider links fail closed).
4. The normalized verified identity email exactly equals `moneytreeventuress@gmail.com`.
5. The application profile's `authUserId` and normalized email match that identity.
6. The current application profile is active and has `role: "admin"`.

The user/profile role is re-read on protected access, so changing the role/status blocks subsequent page and API requests. No browser email, role, user ID, local storage, URL, or request header is used as authorization input. Protected admin pages share the server layout; admin APIs continue through `withAdmin()`. Anonymous API calls remain 401 and signed-in unauthorized calls are 403. No admin server actions were found. The existing background outbox worker uses its service credential and does not impersonate an interactive admin.

## 5. Bootstrap security changes

`createAdminBootstrap` now rejects any identity that is not the verified sole-owner Google account, rejects mismatched/inactive profiles and non-customer roles, changes only the role, and preserves the audit event/idempotency behavior. The Mongo implementation re-reads the auth user, provider link, and profile inside the existing Mongo transaction before changing the role.

The CLI requires both `--confirm-promote-admin` and `--confirm-non-production`, validates the 24-character Better Auth ID shape, and refuses `NODE_ENV=production`. It never runs automatically at app startup/build. No bootstrap command was run and no role was changed.

## 6. Admin login implementation

Added `/admin/login` as `src/app/(public)/admin/login/page.tsx`. The route group keeps this page outside the protected `src/app/admin/layout.tsx`; otherwise the login page would inherit its own access redirect. The page reuses the MoneyTreeVentures visual system, existing Google sign-in button, loading/error states, footer, and a Back to User Login link.

Admin login uses a fixed `/admin` callback, with an error return to `/admin/login?authError=google`. Query parameters cannot select an external or admin callback on the normal customer login page. Better Auth's existing `/api/auth/[...all]` handler and Google provider remain unchanged. An authenticated non-admin is denied at `/admin` and can sign out; visiting the entry page never grants permission.

## 7. Customer login changes

`/login` retains the Google customer sign-in flow and displays Admin Login directly below it. Customer callback behavior still accepts only `/checkout` or `/`; the admin intent is selected by the fixed page mode, not a user-supplied `next` parameter.

If the session endpoint remains pending for 10 seconds, the panel shows a safe unavailable message and retry action instead of an indefinite spinner. This does not allow sign-in or authorization to bypass Better Auth.

## 8. Customer and admin logout

Added a shared `SignOutButton` using the existing Better Auth `signOut` operation. It prevents duplicate submissions, shows a loading state, displays safe errors, then performs a full navigation so authenticated App Router memory is discarded. It does not clear guest-cart storage or customer purchase history. The control appears on `/account`, the admin header, and the restricted admin state. Real session invalidation and subsequent protected-page denial could not be exercised without a working non-production session.

Anonymous `/admin` now redirects to `/admin/login`. The booking page's own anonymous redirect was aligned to avoid a competing `/login` redirect.

## 9. Modified files

- `src/lib/auth/google-identity.ts` — new server-side Better Auth identity reader and owner predicate.
- `src/lib/auth/admin.ts` — centralized owner identity, session, and role policy.
- `src/lib/auth/admin-bootstrap.ts` — policy validation before promotion.
- `scripts/bootstrap-admin.ts` — identity revalidation in transaction, confirmation flags, and production guard.
- `src/lib/auth/client-actions.ts` — fixed admin callback intent and OAuth error return.
- `src/components/auth/login-panel.tsx` — admin intent and bounded session loading/retry.
- `src/components/auth/sign-out-button.tsx` — new shared logout control.
- `src/app/(public)/admin/login/page.tsx` — new public route-group admin login page.
- `src/app/login/page.tsx` — Admin Login entry below customer sign-in.
- `src/app/admin/layout.tsx` — admin login redirect, restricted state/logout, and header logout.
- `src/app/admin/bookings/page.tsx` — consistent anonymous redirect.
- `src/app/account/page.tsx` — account logout control.
- `scripts/smoke-production.mjs` — production checks for `/admin/login` and login-page Admin Login entry.
- `tests/auth/admin.test.ts`, `tests/auth/admin-bootstrap.test.ts`, `tests/auth/auth.test.ts` — policy, bootstrap, callback, route, and logout wiring coverage.
- `docs/ARCHITECTURE.md`, `docs/PROJECT-TRACKER.md`, `docs/REQUIREMENTS-MATRIX.md`, `docs/TEST-REGISTER.md`, `docs/DECISIONS.md`, `docs/LAUNCH-READINESS.md` — current Phase 2 behavior and evidence.
- Created this report: `docs/phases/PHASE-02-AUTHENTICATION.md`.

No dependencies were added. No production credentials, roles, or user records were changed.

## 10. Automated checks

| Command | Result |
|---|---|
| `npm run test:admin` | **PASS** — 16 passed; no database operation |
| `npm run test:auth` | **PASS** — 21 passed; no real OAuth |
| `npm test` | **PASS** — 236 passed, 1 Mongo replica-set integration skipped, 2 mocked Netlify handler tests passed |
| `npm run lint` | **PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** — production build generated `/admin/login` outside the protected route layout |
| `npm run test:smoke` | **PASS** — `/`, `/products`, `/login`, `/admin/login`, `/about`, robots, sitemap, and webhook checks |

The build again emitted two non-fatal `admin.api.request_failed` events with only `errorName=Error`. Phase 1 had observed the same event before this auth work. The safe logger omits the underlying message; cause is not established, so this phase did not suppress or alter it.

## 11. Manual browser results

Using headless Chromium and an intercepted session endpoint that returned an anonymous Better Auth response:

- `/login` and `/admin/login` rendered at 390, 768, and 1440px. Measured document widths were 375, 753, and 1425px against those viewports, with no horizontal overflow.
- Customer Google button and Admin Login link were visible; clicking Admin Login opened the public admin page with its Google button and Back to User Login link.
- The existing theme toggle changed light to dark and then system mode. Keyboard focus was visible on the focused link.
- No Google OAuth flow or real session was started in this browser check.

A separate unmocked local session request reached `/api/auth/get-session`, waited about 39 seconds, and logged `mongodb.connection.initial_failure` followed by `auth.api.request_failed`. No session became usable. The new 10-second timeout was verified in Chromium by deliberately pausing the local `/api/auth/*` request: the unavailable message and retry appeared, and the spinner disappeared. The actual database destination was not independently verified; no write or role mutation occurred.

## 12. Remaining external blockers

- Google OAuth, verified Google claims, and callback completion are not verified.
- MongoDB session/account/profile reads fail from the current local configuration. Do not run bootstrap until a dedicated non-production DB is confirmed.
- Owner bootstrap, actual admin page/API access, role revocation, customer/admin session invalidation, and protected-page denial after logout remain unverified end to end.
- The one Mongo replica-set integration test remains skipped because `MONGODB_TEST_URI` is absent.

## 13. Safe owner provisioning instructions

1. Confirm that the local or dedicated test environment's `MONGODB_URI` points to a disposable non-production database. Do not rely only on `NODE_ENV`; the operator confirmation is required because the CLI cannot infer whether an Atlas URI is production data.
2. Open `/admin/login` and sign in with the approved Google identity. This creates the Better Auth user/account and default customer profile; it grants no admin role by itself.
3. Using a read-only query against that confirmed non-production database, verify exactly one matching `authUsers` record has the approved email and `emailVerified: true`, exactly one `authAccounts` record links that user with `providerId: "google"`, and the matching application profile is active with the same normalized email. Keep the user ID local; do not send it in chat.
4. Run locally only after confirming the database target:

   ```sh
   npm run admin:bootstrap -- --user-id <BETTER_AUTH_USER_ID> --confirm-promote-admin --confirm-non-production
   ```

5. Verify the audit record and `/admin` access in that same non-production environment. Re-running is idempotent. This phase did not execute these steps.

## 14. Phase 3 handoff

Current tracker Phase 3 is catalogue, commerce, PDF, booking, and email integration verification against the existing implementation. Do not start it until the owner reviews this partially verified authentication report. Real admin access should first be confirmed in a dedicated non-production environment.
