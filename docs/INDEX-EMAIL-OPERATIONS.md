# Index and transactional email operations

The application runs with Mongoose `autoIndex: false`. Ordinary requests do not initialize application indexes. `db:inspect` and `db:verify` read the model declarations and installed indexes; `db:indexes` and `db:init` require exact database confirmation before changing indexes. The rate-index migration now derives its unique key from `SupportRateModel` rather than maintaining a second key definition.

The email dashboard's missing rate index was an installed-index gap, not proof of a broken model. The owner reports its guarded repair succeeded. That result applies only to the rate index; all other indexes still require read-only verification. Existing pending confirmations must not be replayed automatically: the deployed worker's earlier HTTP 401 has no confirmed source, and pending records need payment and provider-history review before a live retry.

## Controlled deployment sequence

1. Configure the target environment and separate database credentials; verify `MONGODB_DB_NAME` against the URI and actual connection.
2. Run tests and `npm.cmd run db:inspect -- --confirm-database <target>` from a network that can reach Atlas.
3. Review incompatible indexes, duplicate data and historical migration requirements. Run only the separately authorized, guarded index command for that target. Never run a modifying command in the ordinary Netlify build or application startup.
4. Run `npm.cmd run db:verify -- --confirm-database <target>` as a required, read-only deployment gate. A nonzero exit blocks deployment. Configure this as a required CI job before the Netlify deploy; the current repository does not yet contain an enforced CI deployment gate.
5. Build and deploy after verification, then check the scheduled worker's sanitized response category and the protected endpoint authorization without processing historical events.
6. For one approved nonproduction email test, use the owner-only dashboard and an allowlisted inbox. Resend acceptance, delivery and bounce status are distinct observations.

First deployment to an empty approved nonproduction database can use `npm.cmd run db:init -- --confirm-database <target> --confirm-non-production` after inspection and authorization. Subsequent deployments use targeted migrations. On interruption, inspect and verify before a guarded retry; do not drop incompatible indexes automatically. Rollback restores the previous application version while preserving index and customer records; index removal needs a separate reviewed migration.

## Remaining work

Better Auth adapter index definitions are not fully inventoried by `db:verify`; versioned migration history and a cross-process migration lease are not implemented. Real Atlas index state, the three pending orders' payment/provider history, deployed worker authentication, and actual Resend delivery remain unverified. No live database or provider operation was performed in this task.
