# Phase 2.1 — MongoDB Connection Recovery and Real Authentication Verification

**Status: BLOCKED / PARTIALLY VERIFIED.** The local failure was narrowed to DNS/network resolution before an Atlas connection could be established. A safe non-production database target is not designated, so database reads and owner authentication checks were not attempted.

## Findings

- `.env.local` exists at the project root. Next.js 16 loads root `.env*` files into the Node.js runtime for `next dev`; the installed guide is `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`. The application's lazy environment reader is `src/lib/env/server.ts` and Mongo uses it from `src/lib/db/mongodb.ts`.
- The sanitized local configuration has `mongodb+srv` scheme, an Atlas domain, and database name `moneytreeventures`. The URI/database are not marked as disposable development/test resources. `NODE_ENV` was unset in the direct local diagnostic; Next dev's mode does not identify which Atlas data the URI targets.
- SRV DNS resolution timed out with both the OS resolver and the Google DNS servers configured by `dev-dns.cjs`. No Atlas host records were returned in the diagnostic window. This is the first observed failure point and prevents diagnosing later stages such as Atlas network allow-list, TLS, authentication, permissions, and database selection.
- A bounded Mongoose handshake diagnostic was started with a 6-second server-selection timeout; it did not return a driver result within the tool session and was interrupted. It issued no database command. Consequently there is no verified Mongoose error code or database connectivity result to report from this run.
- Earlier Phase 2 evidence recorded `mongodb.connection.initial_failure` after about 39 seconds and `auth.api.request_failed`. The Mongo service catches the driver exception and logs only its error class before replacing the message with a generic redacted `Error`; the auth route also records only `errorName`. Do not infer a more specific driver cause from those logs.
- `withAdmin()` emits `admin.api.request_failed` for uncategorized non-`ApplicationError` exceptions, so a sanitized Mongo failure can produce that event. The historical prerender events have no correlated route/request/stack evidence; their specific cause remains unknown.

## Changes and safety

- No application code, `.env.local`, Atlas setting, collection, account, or role was changed.
- No database ping, collection query, data write, migration, bootstrap, OAuth flow, or production operation was completed.
- No owner identity/profile existence is claimed. The target database is not proven non-production, and the owner must designate an isolated test database before any auth-record lookup or bootstrap.
- No dependencies were added.

## Authentication verification

| Check | Result |
|---|---|
| `/login` and `/admin/login` presentation/navigation | Previously passed with mocked anonymous Better Auth session; no real OAuth was started |
| Google callback and session creation | Not verified; DNS/Mongo blocker and owner interaction required |
| Owner profile and linked Google account | Not queried; target environment is not classified |
| Owner-only admin authorization against real records | Not verified |
| Customer/admin logout invalidation | Not verified against a real session |
| Admin bootstrap | Not run; no role changed |
| Existing mocked policy/auth tests | Prior Phase 2 test results remain valid and are not repeated here |

## Owner actions to unblock

1. Designate a separate disposable non-production Atlas database/cluster and confirm that local configuration points to it. Do not reuse a production URI for integration verification.
2. From the same local machine/network, restore SRV DNS resolution. If Atlas is used, verify the cluster hostname resolves, then check the Atlas project's IP access list for the current development egress IP. Avoid broad `0.0.0.0/0` access; use a narrow temporary rule only if necessary and remove it after testing.
3. Confirm the Atlas database user has only the minimum permissions needed for the application and intended verification, and confirm the selected database name. Do not send credentials in chat.
4. Retry a read-only ping against the designated non-production target. Only after it succeeds, sign in at `/admin/login` with the approved Google account and verify its auth user/account/profile records using a read-only query.
5. If and only if the owner explicitly approves promoting that verified owner in that non-production database, follow the bootstrap steps in [the Phase 2 report](PHASE-02-AUTHENTICATION.md). This task did not execute them.
6. Verify `/admin`, customer/admin logout, session invalidation, and denial after logout in that same isolated environment. Repeat OAuth redirect/callback verification against the locally registered callback URL as appropriate.

## Result

The current blocking condition is DNS/network resolution from this execution environment; no application connection-service defect was demonstrated. Atlas firewall, TLS, credentials, permissions, and database choice remain untested. Phase 2 remains partially verified and Phase 3 should not begin until a designated non-production connection and owner sign-in flow are confirmed.
