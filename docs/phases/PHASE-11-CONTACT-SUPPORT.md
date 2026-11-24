# Phase 11 ? Contact and support

Implemented 2026-11-21 with partial verification. Public /contact now contains an accessible form for name, email, category, subject, message and acknowledgement. Anonymous visitors may submit. The server validates a strict field allowlist and 8 KB request limit, checks same origin, and stores the request before returning a random reference. Failed storage returns a failure response. React renders submitted text as text.

Support requests have unique references, new/in_progress/resolved/closed status, timestamps, grievance category, private notes, status history and admin sorting/filter indexes. No client customer ID or order association is accepted. A per-email hourly counter is stored in MongoDB with a unique window index and TTL; five submissions per hour are allowed. A future stronger anti-bot control may be needed against attackers rotating addresses. Data retention remains pending owner policy; records have no automatic deletion. The admin inbox supports category and status filters, exact reference/email search, 20-item pagination, detail viewing, notes and status updates. The admin layout and requireAdmin protect the page and APIs. Updates and audit records share one MongoDB transaction. No public detail endpoint exists.

Grievances use their own category and the same reference/status/history workflow. No officer identity or statutory deadline was invented. Owner/legal review is needed for business contact details, grievance officer, retention and response policy.

No support email is queued or sent. The operational recipient and approved sender have not been confirmed for this workflow. The existing Resend/outbox code was not changed. A saved request remains in the database even when notification is unavailable. UI does not claim email delivery.

## Verification

TypeScript and ESLint passed. One support schema/index test passed. Existing admin authorization suite passed 18 tests and existing Chromium component fixtures passed 4. Isolated production build passed with process-only PUBLIC_MEDIA_BASE_URL=https://media.example.com and dummy localhost MongoDB; expected sanitized unavailable-DB errors appeared. Production smoke passed for existing routes and security checks. The new support form was not submitted against a live database. An initial build failed because two new component files had invalid UTF-8; corrected and rerun successfully. git diff --check passed with existing line-ending notices.

The ordinary production build remains blocked by the configured r2.dev PUBLIC_MEDIA_BASE_URL. A successful isolated build does not establish MongoDB connectivity, support persistence, rate limit index application, transaction durability, email delivery, or authenticated owner browser behavior. The requested 390/768/1440 responsive and light/dark manual matrix is NOT_RUN. To complete live verification, use an explicitly approved disposable non-production database and synthetic support submissions, then sign in as the owner to inspect, update and reload them.

## Changed files

src/app/contact/page.tsx; src/components/pages/contact-form.tsx; src/lib/db/models/support.ts and index.ts; src/lib/support.ts; support API routes; src/components/admin/support-inbox.tsx and admin-navigation.tsx; src/app/admin/support/page.tsx; tests/support.test.ts; tsconfig.env-test.json; scripts/smoke-production.mjs; this report and the tracking documents.

Phase 12 awaits owner instruction. Existing R2, production media domain, MongoDB/index, product seeding and mapping, Cashfree, private PDF delivery, legal review and broad end-to-end blockers remain.


## Follow-up: /admin prerender defect ? 2026-11-21

Added a request-time connection boundary before dashboard database access. Verification and real-session limitations are recorded in docs/TEST-REGISTER.md and NEXT_TASK.md. Historical Phase 11 verification above is unchanged.
