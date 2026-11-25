# Environment portability audit — 25 November 2026

## Findings and corrections

Runtime email testing previously pinned the staging hostname and database name. It now requires an explicit `staging-only` role, matching HTTPS `APP_URL` and `BETTER_AUTH_URL` origins, and `EMAIL_TEST_DATABASE_NAME` equal to the configured database. Local testing retains its stricter `local-development-only` role and the protected existing `moneytreeventures` database. Production email testing remains disabled unless explicitly enabled and assigned an allowed nonproduction role and database; the protected local database is never accepted on HTTPS.

The synthetic purchase email previously defaulted to a staging account link. Its account link now comes from the configured application origin. The Resend smoke command previously required one specific sender domain; it now checks sender address syntax while the sender and API key remain server configuration. The production smoke check now compares canonical URLs against `APP_URL` when supplied. Cashfree environment endpoints, local loopback detection, and database names in guarded migration rules are security or protocol constants, not deployment defaults.

The sole approved owner Gmail address remains pinned by the repository's permanent owner-only authorization rule. It must not become a freely configurable admin allowlist without a separate owner policy change. Public support addresses in legal pages remain part of customer-facing policy text and need owner/legal review before replacement.

The tracked `.env.example` contained credential-shaped example values. They were replaced with placeholders. Treat any real credentials previously copied into a tracked file as exposed and rotate them in the relevant services. No value is reproduced here.

## Environment configuration

| Scope | Local | Staging | Production |
| --- | --- | --- | --- |
| Site/auth origin | matching HTTP localhost `APP_URL` and `BETTER_AUTH_URL` | matching approved HTTPS origins | matching approved HTTPS origins |
| MongoDB | existing `moneytreeventures` | isolated `moneytreeventures_staging` | separate approved production database |
| Email test role | `local-development-only` | `staging-only` | unset by default |
| Email test recipients | owner-approved allowlist | owner-approved allowlist | unset by default |
| Cashfree | sandbox credentials and mode | sandbox until separately approved | production credentials and mode only after approval |

Configure `MONGODB_URI`, `MONGODB_DB_NAME`, `APP_URL`, `BETTER_AUTH_URL`, Better Auth and Google credentials, Cashfree credentials/mode/return URL, R2 private and public media settings, `RESEND_API_KEY`, `EMAIL_FROM`, and `OUTBOX_WORKER_SECRET` in each environment's server runtime. Set `EMAIL_TESTING_ENABLED=true` only for an approved test and align the role, database name, recipient allowlist and sender. Netlify build and Functions scopes must include the applicable values; scheduled and API functions must receive the same worker secret. Register the appropriate Google callback origin with Google. The production-mode build must use staging values for a staging deployment.

## Database and external checks

The migration CLI verifies requested, configured and connected database names before mutations. The existing local database is protected from generic bootstrap. No migration was run. The read-only rate-index preflight could not inspect Atlas because DNS SRV resolution timed out; run it in the owner's working PowerShell environment before considering the guarded index command. Versioned migration history, cross-process locking and Better Auth index inventory remain open in `docs/DATABASE-BOOTSTRAP.md`.

Application/test TypeScript, admin CLI compilation and focused ESLint passed. Focused email/environment/auth tests passed 45/45; the full repository test command passed 381/385 with four existing skips, plus six worker tests. A production build generated 55/55 pages; `git diff --check` passed. Automated tests mock external services. Resend acceptance, inbox delivery, Netlify worker authorization, Cashfree webhooks, private R2 access, authenticated browser journeys, and live MongoDB index state remain unverified. No deployment or provider send occurred. See `docs/TEST-REGISTER.md` for historical results.

## Files changed for this audit

`src/lib/email/email-testing.ts`, `scripts/email-test-resend.ts`, `scripts/smoke-production.mjs`, `tests/email/email-testing.test.ts`, `.env.example`, `docs/STAGING-EMAIL-TESTING.md`, `docs/ENVIRONMENT-PORTABILITY-AUDIT.md`, and `NEXT_TASK.md`.
