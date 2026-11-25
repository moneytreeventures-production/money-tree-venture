# Transactional email deployment runbook

## Environment settings

Configure separate Netlify sites and separate credentials for staging and production. In each site's build and Functions runtime scopes, set `APP_URL`, `BETTER_AUTH_URL`, `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CASHFREE_ENVIRONMENT`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET`, `CASHFREE_API_VERSION`, `CASHFREE_WEBHOOK_VERSION`, `CASHFREE_RETURN_URL_BASE`, `RESEND_API_KEY`, `EMAIL_FROM`, and `OUTBOX_WORKER_SECRET`. Use placeholders only in tracked files. The scheduled Function and Next.js API must receive the same site-specific worker secret. Configure the site's approved HTTPS origin in both URL variables. Register that origin's Better Auth Google callback with Google. Configure the matching Cashfree webhook URL and `/checkout/return` URL for that environment. Keep the sending domain verified in Resend.

Staging uses its isolated database, `CASHFREE_ENVIRONMENT=sandbox`, and `EMAIL_TEST_RECIPIENTS=<approved-test-inboxes>`. Production uses separate database and credentials, `CASHFREE_ENVIRONMENT=production`, and real verified customer recipients. Leave `EMAIL_TESTING_ENABLED` unset in production. Preserve configured Cashfree API versions; verify any change against the installed integration before rollout.

## Database and deployment order

Run `npm.cmd run db:inspect -- --confirm-database <exact-target>` and `npm.cmd run db:verify -- --confirm-database <exact-target>` from a controlled environment. Review missing/incompatible indexes before any explicitly authorized migration. Never run modifying migrations from app startup, a request, or an unguarded Netlify build. Confirm the outbox dedupe index, checkout claim index, purchase indexes, and email test rate index. Build only after read-only verification passes. Do not replay historical pending events during initial staging setup.

After deployment, confirm the scheduled `process-outbox` Function appears with its 15-minute schedule in Netlify. Inspect sanitized Function logs for HTTP status and category. An HTTP 401 needs comparison of the deployed Function and API `OUTBOX_WORKER_SECRET` scopes, the effective `APP_URL`, and redirects. Do not log secret values. The earlier 401's exact origin is still unknown.

For one approved fresh staging purchase, verify the payment on Cashfree sandbox, confirm the order and outbox event are paid/order-scoped, then observe the worker claim and Resend acceptance ID. Check Resend's delivered or bounced result separately and verify inbox receipt. Do not treat a `sent` outbox status as proof of delivery.

## Local automation

The local worker is disabled unless `EMAIL_LOCAL_WORKER_ENABLED=true` is set alongside local development identity, matching localhost app/auth URLs, the existing local database name/role, a worker secret and an approved recipient allowlist. Start the Next.js dev server separately, then run `npm.cmd run email:worker:local` in PowerShell; press Ctrl+C to stop. The runner captures its startup time and asks the authenticated endpoint only for events created afterward. It must be started only for an approved test because eligible new events may send email. Existing historical events are excluded by the cutoff. The runner does not start during app startup or build.

Rollback by stopping the worker or reverting the application version. Keep outbox records and provider idempotency keys intact; inspect provider history before any replay. No email, payment, migration or deployment was performed while preparing this runbook.
