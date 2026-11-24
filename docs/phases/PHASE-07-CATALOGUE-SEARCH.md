# Phase 7 — Category Selection and Public Catalogue

**Checkpoint:** 2026-11-21  
**Status:** Implemented locally; live database-backed acceptance remains pending.

## Admin category selection

The Product model, validation, and service already supported an array of category IDs. The defect was at the editor boundary: it used a native multiple-select, which commonly requires Ctrl/Cmd-click and is poor on touch devices. Category-fetch failures were also swallowed and appeared as an empty list. No schema migration was needed.

The editor now uses an accessible checkbox picker with explicit loading, empty, error/retry, and selected states. Selections are controlled independently from the category fetch and are submitted as category IDs. Existing inactive or unknown references are shown and can be removed, but cannot be newly assigned. The server continues to validate IDs and category rules. Product optimistic concurrency now turns stale concurrent edits into a conflict rather than silently overwriting category relationships.

Service tests cover one/multiple selections, replacement/removal, inactive-reference preservation during unrelated edits, and concurrent update conflict handling. Chromium component tests cover selected/inactive/loading/empty/error states. These are local fixtures and mocked services: no authenticated browser session or live Mongo persistence test was available.

## Public catalogue

`/products` remains backed by the existing public product API and service. New query support includes bounded normalized text search across name and descriptions, active category slug filtering, INR minimum/maximum converted to paise, product type, featured/newest/price sorting, bounded database pagination, and stable tie-breaking. The public service always scopes results to published products. It counts and queries in MongoDB rather than fetching the collection into the browser.

Search and filter state is represented in the URL, survives refresh, supports browser back/forward, resets the page after filter changes, and ignores invalid values safely. Product cards use returned product data and show thumbnail/fallback, title, description, price, type, actual active category names where available, and supported featured state. Category and catalogue API errors have separate retryable states; empty results do not use invented products.

A Mongo text index and query-pattern indexes are declared in the Product model. They are not applied to any database in this checkpoint. Apply the repository's reviewed index initialization procedure only to an explicitly approved non-production database before live search verification.

## Product details and media

The existing published-product detail route was reviewed and reused without redesign. It already renders supported product description, prices, categories, product type, features, benefits, included content, bundle PDFs, FAQs, SEO metadata, and existing cart/booking actions. Optional promotional video is preview media only: controls are present, autoplay is absent, preload is `none`, and thumbnail is the poster/fallback. Private PDF masters remain outside public media rendering.

Audience content and related-product recommendations are not represented by the current supported schema/relationship. They were not invented or added. Draft and archived products remain excluded by existing public service policy. `notFound()` is the route mechanism; this phase did not independently verify streamed production HTTP status for an invalid slug.

## Verification

- `npm.cmd run test:catalog`: PASS, 78/78.
- `npm.cmd run test:models`: PASS, 14/14; includes declared text and compound indexes.
- `npm.cmd run test:browser`: PASS, 4/4 Chromium component fixtures; not a full browser journey.
- `npx.cmd tsc --noEmit`: PASS.
- `npm.cmd run lint`: PASS.
- Isolated production build: PASS with process-only `PUBLIC_MEDIA_BASE_URL=https://media.example.invalid` and a dummy localhost MongoDB URI/name. Two sanitized admin-count API failures were logged because the dummy database is unavailable; this is not integration verification. The real `.env.local` was not changed.
- `npm.cmd run test:smoke` with the same process-only overrides: PASS for homepage, `/products`, login routes, `/about`, robots, sitemap, security headers, and rejection of unsigned Cashfree webhook requests. No payment was initiated.
- An initial smoke attempt without the overrides timed out before the server was ready because it inherited the current local environment; the retry above passed. No environment file was changed.
- `git diff --check`: PASS for Git-tracked changes (Git emitted existing LF/CRLF normalization notices). It does not inspect the many untracked application and documentation files in this workspace.

## Remaining checks

- Owner-authenticated admin selection/save/reload and category persistence against approved disposable MongoDB: **NOT RUN**.
- Database index initialization and DB-backed search/category/price/type/pagination checks: **NOT RUN**.
- 390/768/1440 route-level browser, theme, overflow, and keyboard review: **NOT RUN**; only focused component rendering ran.
- R2, signed PDF download, Cashfree sandbox, customer ownership, and email flows: unchanged and not tested in Phase 7.
- Phase 6 seed apply remains unrun. Its source still describes four categories/ten candidate products; no claim is made that those records exist in MongoDB. Owner-reported manual product creation/publication remains owner-reported, not independently observed here.

No dependencies were added. No DB, seed, R2, payment, deployment, DNS, auth, admin-role, or homepage data operation was performed.
