# Phase 6 — Admin Navigation and Product Seed Preparation

Status: `PARTIALLY_VERIFIED` — local UI fixes and a no-database dry run are verified. No database was queried or changed, and no product was published.

## Scope and decisions

- Confirmed product scope: individual downloadable PDFs, bundles made only from PDFs, and the separate 1:1 Call Guidance booking product. The source's paid video and video-plus-files formats are incompatible and remain blocked. An optional promotional video reference in the existing product model is preview media only; it is not a product or fulfilment format.
- The existing `scripts/seed/source-products.ts` is the authoritative source fixture. Its copy is draft material, not owner-approved commercial content.
- The owner reports having created and published a product through the admin browser. This is owner-reported evidence; Codex did not independently verify the authenticated browser or database.
- Seed imports are drafts only. Existing category/product records are never overwritten. The seeder defaults to a source-only dry run and refuses apply unless an exact non-production database name, explicit confirmation and unmapped-field acknowledgement are provided.

## Admin UI changes

- The `/admin` Manage Products control used the generic theme-token pair `bg-primary text-background`. Although this pair is designed for contrast, it reads as a neutral inverted button and did not carry the expected primary action emphasis. It is now the brand orange action with navy text, hover treatment, and visible focus ring. This is a local CTA change; shared button/global styles were not changed.
- Navbar authorization now asks a same-origin, no-store server Route Handler for the existing `getCurrentAdmin()` decision. That helper verifies the active application profile, admin role, current authenticated session, verified Google provider link, and exact owner identity. The response contains only `{ isAdmin: boolean }` and no profile data.
- Desktop and mobile account links share the same state. Until the trusted server decision succeeds, the UI remains Account → `/account`. A missing session, session change/logout, rejected request, expired session or policy denial cannot retain the prior user's Admin Panel state. `session.updatedAt` changes trigger revalidation; abort handling prevents stale responses from replacing a newer session decision.
- The protected `/admin` layout and API authorization were not changed.

## Source and mappings

The fixture has 4 categories and 10 products. Its categories map by exact slug and display order. A non-production apply may reuse a category only when its name, order and active status match; otherwise the tool stops before writes. Missing categories may be created. No database category state was inspected in this phase.

Mapping rules: `title` → `name`; `categorySlug` → `categoryIds`; whole-rupee source prices → integer paise; source description, short description, features, benefits, included content, FAQs, featured flag and leaf number → their existing product fields. `pdf` maps to a draft `pdf`; `consultation` maps to a draft `call_guidance`. These products remain drafts and have no invented PDF asset, booking duration, or booking instructions.

| Source product | Source format | Phase 6 result |
|---|---|---|
| The Whole Money Tree Bundle | `bundle` | Blocked: the source promises an eight-guide bundle and its source items include incompatible video delivery; no PDF-only bundle contents can be verified. |
| Freelance Starter Kit | `video_and_files` | Blocked: video lessons and a PDF are promised. |
| Ghar Se Earning Blueprint | `video` | Blocked: paid video-only source. |
| Canva Design Side Hustle | `video_and_files` | Blocked: video lessons and templates are promised. |
| Content Writing in Hinglish | `video_and_files` | Blocked: video lessons and workbook are promised. |
| Social Reselling from Home | `video_and_files` | Blocked: video lessons and supplier sheet are promised. |
| Real vs Scam Job Checker | `pdf` | Mappable to a PDF draft; actual approved PDF asset is still required before publishing. |
| Instagram Page Growth Playbook | `video_and_files` | Blocked: video lessons and a content calendar are promised. |
| Online Tuition Setup | `video_and_files` | Blocked: video lessons and PDF are promised. |
| 1:1 Clarity Call | `consultation` | Mappable to a Call Guidance draft; owner must confirm call details and booking instructions before publishing. |

The existing schema has no appropriate fields for source `formatDetail`, `audience`, `tags`, or `whoShouldBuy`. These are retained unchanged in the source fixture and explicitly listed in dry-run output, but are not persisted on the Product documents. Apply therefore requires `--acknowledge-unmapped-source-fields`; no unrelated fields are used as substitutes. No schema expansion was made.

The source's whole-rupee values convert exactly (for example, ₹99 → 9,900 paise and ₹499 → 49,900 paise). These are source draft prices only and were not written to a database.

## Seeder behavior and safety

- `npm run seed:products` (or with `--dry-run`) compiles and prints a deterministic mapping summary without loading credentials or connecting to MongoDB. It reports 4 categories, 10 products, 2 draft-compatible mappings and 8 blocked incompatible formats; the output reports `databaseMutations: 0`.
- Apply requires `--apply --confirm-non-production --target-db <exact-db-name> --acknowledge-unmapped-source-fields`. The configured DB must be named with a clear `dev`, `development`, `test`, `testing`, `staging`, `sandbox`, or `local` marker, and `NODE_ENV=production` is rejected. It confirms the connected database, verifies the active owner admin and linked Google identity server-side, checks category/product slugs before writes, does not overwrite records, creates categories/products through existing services, and creates only drafts. Product writes use the existing product service and audit transaction.
- A matching existing draft is reported as already present. A conflicting slug or incompatible category aborts before writes. Per-product failures are reported; a failed apply may have created earlier compatible categories/products, and a rerun is safe/idempotent after the cause is resolved.
- Apply was not run. No live or non-production database, credentials, R2, uploaded PDF, admin browser session, or production record was accessed.

## Owner content-review checklist

Before seeding or publishing, confirm source copy and commercial terms for every item:

1. **Whole Money Tree Bundle:** whether eight guides actually exist; exact PDF-only contents; lifetime updates and private learners group promises; and the source's included items.
2. **Freelance Starter Kit:** whether the deliverable is now a PDF-only starter kit; remove/replace the paid video promise only with approved copy and files; confirm the stated 3.5-hour duration if still meaningful.
3. **Ghar Se Earning Blueprint:** provide the real PDF and approve replacement copy for the paid video and stated 4-hour duration.
4. **Canva Design Side Hustle:** confirm the 40 templates exist and are deliverable in an allowed PDF format; resolve the video and stated 3-hour promise.
5. **Content Writing in Hinglish:** verify workbook contents and resolve the video and stated 2.5-hour promise.
6. **Social Reselling from Home:** verify supplier sheet contents and resolve the video and stated 3-hour promise.
7. **Real vs Scam Job Checker:** provide the real PDF; verify checklist content and the stated 45-minute estimate.
8. **Instagram Page Growth Playbook:** resolve the video and verify the promised content calendar.
9. **Online Tuition Setup:** provide/verify the PDF-only deliverable and resolve the video and stated 2.5-hour promise.
10. **1:1 Clarity Call:** confirm the service scope, 30-minute duration, booking instructions, and customer-facing scheduling process.

For all ten, owner-review the selling/compare-at prices, discount presentation, FAQs (including lifetime-access wording), included-content claims, audience, and source tags. Confirm the no-income-guarantee disclaimer remains accurate. Do not publish until the claim is approved, eligible category is active, real private PDF assets are uploaded for PDFs and each PDF-bundle child, and Call Guidance has valid booking details. No asset or record was fabricated.

## Verification evidence

- `npm run seed:products -- --dry-run`: PASS; compiled and produced the expected 4/10 counts, mapping statuses and zero mutations. This did not inspect database conflicts.
- `npm run test:seed`: PASS, 4 tests for source counts/formats, paise conversion, copy preservation, unmapped fields and non-production/apply guards.
- `npm run test:admin`: PASS, 18 tests including existing owner-only policy cases and Account/Admin Panel destination policy.
- `npm run test:browser -- --test-name-pattern="Manage products CTA"`: all 3 registered browser component tests ran and passed (the script currently forwards the name pattern after its glob, so existing product-media/listing tests also ran). Manage Products anchor styling/destination was checked in Chromium.
- `npx tsc --noEmit`, targeted ESLint and full `npm run lint`: PASS after fixing all findings introduced in this phase.
- No live authenticated admin browser navigation was run; customer/admin/anonymous result coverage is policy/unit-level, not a signed-in end-to-end browser test. No DB or R2 test was run.
- Plain `npm run build`: code compilation and TypeScript completed, but admin prerender failed because the existing `.env.local` `PUBLIC_MEDIA_BASE_URL` uses an `r2.dev` host rejected by production validation. `.env.local` was not changed.
- Isolated build: `PUBLIC_MEDIA_BASE_URL=https://media.example.invalid`, `MONGODB_URI=mongodb://127.0.0.1:27017/moneytree_dev?directConnection=true`, and `MONGODB_DB_NAME=moneytree_dev` were temporary process-only overrides; the production build completed, including `/api/navigation/account`. Two existing sanitized `admin.api.request_failed` events occurred while the dummy localhost DB was unavailable. This is a build check only, not provider or DB verification.
- Full test suite, client bundle scan and production smoke were not run in this checkpoint. `git diff --check` exited successfully for tracked diffs, with existing LF/CRLF notices; most source/docs files in this working tree are untracked, so that command does not cover those files.

## Remaining owner actions / Phase 7 prerequisites

1. Confirm or replace the incompatible paid-video draft copy with accurate PDF-only source material; supply actual PDF files and verify all commercial claims.
2. Decide how to retain or remove the four source-only fields without misrepresenting them; approve or reject their omission explicitly.
3. Name and explicitly approve a disposable non-production database. Review its existing category/product slug conflicts before invoking apply.
4. Upload approved private PDF masters through the existing admin/R2 tooling; verify PDF bundle relationships and Call Guidance scheduling details.
5. Test desktop/mobile navigation under actual owner, customer and anonymous sessions, including login/logout/session expiry.
6. Resolve the existing production media-domain validation issue before a normal production build. R2 provider verification remains pending.

Phase 6 stops here. Phase 7 has not started.
