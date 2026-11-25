# Database bootstrap status

The explicit CLI now inventories 22 application Mongoose collections and four Better Auth collections. It compares declared keys in order, uniqueness, partial filters, sparse settings, TTL and collation against installed indexes. MongoDB's automatic `_id` index is reported only as an existing index. Better Auth collections are created for a fresh database, but their adapter-managed index requirements have not yet been established. The installed `@better-auth/mongo-adapter` can create field indexes during application operations; the current inventory does not verify those definitions, so this is an outstanding bootstrap requirement.

Run from PowerShell with configured `MONGODB_URI` and `MONGODB_DB_NAME`. The CLI loads `.env.local`; never paste its contents into reports. `--confirm-database` must match `MONGODB_DB_NAME`, the URI database path if present, and the connected database name.

```powershell
npm.cmd run db:inspect -- --confirm-database moneytreeventures_staging
npm.cmd run db:verify -- --confirm-database moneytreeventures_staging
```

These commands are read-only. For a newly selected **empty nonproduction** database, the explicit bootstrap is:

```powershell
npm.cmd run db:init -- --confirm-database <confirmed-new-database-name> --confirm-non-production
```

It creates application and auth collections and declared application indexes. An interrupted empty bootstrap can be rerun. It refuses unknown collections, existing documents, incompatible indexes and production mode. It does not seed users, purchases or orders. The existing guarded `db:indexes` migration remains the path for populated databases; its repurchase preflight and explicit nonproduction flags remain unchanged.

**Current limits:** This is not yet a complete versioned migration system. There is no migration history or cross-process lease, and populated-database migrations still need reviewed, specific commands. Better Auth index requirements need verification against the installed adapter. No disposable MongoDB run has proved fresh creation, interruption recovery or concurrent runner safety. Do not use `db:init` for production. Check Atlas DNS/network access before interpreting CLI connection failures as schema failures. The existing `moneytreeventures` database is protected from generic `db:init`; use its read-only preflights and only reviewed, explicitly authorized targeted index commands.

The staging repurchase blocker remains pending: run the read-only preflight below, review its output, and obtain explicit approval before running the modifying migration.

```powershell
npm.cmd run db:indexes -- --confirm-database moneytreeventures_staging --repurchase-indexes-only --confirm-non-production --preflight-only
```
