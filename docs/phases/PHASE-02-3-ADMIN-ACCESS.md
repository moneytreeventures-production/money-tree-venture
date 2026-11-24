# Phase 2.3 — Admin Access Blocker

**Status: BLOCKED / REAL OWNER ACCESS NOT VERIFIED.** The owner explicitly confirmed the target is non-production. A fresh read-only Mongo connection from this execution environment still failed during Atlas SRV DNS resolution, before account records could be queried.

## Findings

| Question | Finding |
|---|---|
| Actual admin gate | `src/app/admin/layout.tsx` calls `resolveAdminRouteAccess(requireAdmin)` before rendering protected children. Anonymous users are redirected to `/admin/login`; signed-in unauthorized users receive a restricted-access page. Protected admin navigation and page children render only after `requireAdmin()` succeeds. |
| Owner admin authorization result | `DENIED` per the owner-provided Access Denied screenshot. By source behavior, this is the signed-in authorization-denial branch, not the anonymous redirect branch. The specific failing database predicate remains unknown until the owner records can be read. |
| Owner role provisioning | The bootstrap is confirmed not to have run. New application profiles default to `customer`; therefore the intended admin role has not been provisioned through the approved bootstrap. A manual role change could exist, so the current owner profile's role remains UNKNOWN until records are read. |
| Wrong Google account / provider link / verification | UNKNOWN. The owner identity records were not queried. Policy requires the exact approved email, a verified Better Auth identity, exactly one linked Google provider, and an active account. |
| Active profile / session match | UNKNOWN for the live owner session. Source requires the Better Auth session user ID and normalized email to match the application profile and verified Google identity. |
| Login callback | Source sets the admin callback to `/admin` and the error callback to `/admin/login?authError=google`. No callback-selection defect was found in source. This does not independently prove the browser's final redirect after OAuth. |
| AdminGate/page rendering | No access-control bypass found. `src/app/admin/page.tsx` is synchronous and only provides the foundation page. The layout gates it. HTTP 200 alone does not demonstrate access because the route streams redirects/denial UI. |
| Local anonymous route check | `GET http://localhost:3000/admin` without an owner cookie returned HTTP 200 and streamed a meta refresh to `/admin/login`; there was no admin navigation. This verifies anonymous behavior only, not owner access. |
| Local auth endpoint | `GET http://localhost:3000/api/auth/get-session` without an owner cookie returned HTTP 200 with no session/user. It does not test the owner's browser session. |
| Same-runtime read-only Mongo diagnostic | `node -r ./dev-dns.cjs` with `@next/env`, a non-production target guard, bounded connect/ping, and read-only collection lookups | Fresh local process using the app's configured DNS override | `BLOCKED` — Atlas SRV query returned sanitized `Error` / `ETIMEOUT` before Mongo ping. No `authUsers`, `authAccounts`, `authSessions`, or `users` collection was queried. |
| Instant-navigation warning | The reported warning names the synchronous admin page, while session/database checks are in the layout's `AdminGate` under a `Suspense` fallback. Next's installed docs describe instant-navigation insights as development-only navigation/prefetch validation. The exact warning text was unavailable, so the precise trigger is unconfirmed. It is independent of the authorization policy. No `instant = false` change was made. |

## Database diagnostic limits

The owner explicitly confirmed the database currently used for local verification is non-production. The owner reports that the Next.js process logs `mongodb.connection.connected`. Two independent fresh-process diagnostics failed with sanitized `Error` / `ETIMEOUT` during Atlas SRV resolution, including one launched with the same `dev-dns.cjs` resolver override used by `npm run dev`; no database ping, collection lookup, or session query completed. The connected Next.js process and fresh shell processes therefore have different observed connectivity. No owner records or session tokens were read.

The owner-provided screenshot establishes `Admin authorization: DENIED` for that request. The remaining record-level diagnostic fields are unavailable until a process can reach the confirmed non-production database. Report only:

- Owner profile exists: YES/NO
- Verified Google provider identity: YES/NO/UNKNOWN
- Active account: YES/NO
- Admin role assigned: YES/NO
- Admin policy authorization: ALLOWED/DENIED
- Specific sanitized denial reason

Never log or report session tokens, cookies, provider tokens, full database URIs, or unrelated profile data.

## Safe next step

1. Make the confirmed non-production DB reachable from the same execution context used for diagnostics, or run the read-only diagnostic locally in the Next.js-connected environment. Do not expose the database URI or tokens in logs/chat.
2. Query Better Auth's user/account collections and the application profile read-only. Do not call the customer-profile provisioner for this check because it performs an upsert.
3. Evaluate the existing `isAuthorizedOwnerAdmin()` policy using trusted database/session values. Do not accept client-submitted email or role. The current owner's browser session must be checked in that browser; this diagnostic had no owner cookie.
4. If the owner identity is valid but the active profile is still a customer, obtain explicit approval before running the existing secure bootstrap. It requires both confirmation flags and must remain local/non-production:

   ```sh
   npm run admin:bootstrap -- --user-id <BETTER_AUTH_USER_ID> --confirm-promote-admin --confirm-non-production
   ```

5. Sign in again at `/admin/login`, verify the actual `/admin` protected navigation/dashboard, then verify sign-out blocks subsequent admin navigation. Never bootstrap an unverified, non-owner, inactive, or non-production-unconfirmed account.

## Code changes and tests

No application code change was justified by the evidence available. The admin callback and gate are correctly wired in source; there is no confirmed authorization defect to fix. Focused existing policy/callback tests were not rerun because no code changed. The real owner access decision remains unverified.
