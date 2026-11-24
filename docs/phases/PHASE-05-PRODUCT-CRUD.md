# Phase 5 — Admin product management and lifecycle verification

**Status:** `PARTIALLY_VERIFIED` · local checks only · 2026-11-21

## Existing implementation reused

- Product Mongoose model, strict create/update/list schemas, INR integer-paise pricing, slug uniqueness, transactional audit service, admin API wrapper, category rules, lifecycle policy, guarded deletion, private PDF asset service, and Phase 4 media upload routes/UI were already present.
- Existing product types remain `pdf`, `pdf_bundle`, and `call_guidance`. Bundle/Starter Kit differentiation remains `bundleKind`; PDF assets and call booking fulfilment remain separate. No product schema, historical order, payment, entitlement, authentication, or PDF pipeline changes were made.

## Gaps fixed

- The admin listing now distinguishes initial loading, empty results, and fetch errors instead of rendering an empty collection while the request is pending.
- Listing rows show product image/fallback, name, slug, type, category names, INR selling and compare-at values, featured marker, status, and existing actions.
- Category data now comes from the authenticated admin category API, including category status. An inactive/archived category already assigned to a draft remains visible in the edit form so simply saving does not silently remove that relationship. New assignments remain limited to active categories; the service continues to enforce valid category relationships.
- A missing thumbnail still produces the existing record warning and safe placeholder, but no longer blocks publication by itself. Required malformed fields and bundle-kind warnings still disable lifecycle actions; server-side publish validation remains authoritative for PDF assets and bundle contents.
- Editing an existing product with a blank compare-at price now sends `null`, which clears the optional value. Create still omits an unset compare-at price.
- Added a focused regression test for clearing compare-at pricing without changing product identity.

## Product operations and relationship rules

- Create saves a draft. Slug generation/editing, INR rupees-to-paise conversion, descriptions, product type, category selection, optional media, PDF assignment/upload, bundle contents, features/benefits/content/FAQs, featured/display order, and SEO fields use existing APIs/validators. Existing type is immutable on edit.
- Search, type/status/category filters, pagination, stable server sorting, edit, publish, unpublish, archive, and guarded delete are present. Delete remains unavailable for published products and server checks preserve order, entitlement, booking, coupon, bundle, outbox, and PDF-version history. It was not invoked against any database.
- Server services continue to reject duplicate slugs, invalid pricing/categories, invalid PDF ownership/status, self/nested/non-PDF/duplicate bundle contents, and invalid publication transitions. Category deactivation remains blocked when published products use that category.
- Consultant Calls retain their separate booking workflow and never require a PDF asset.

## Media and data compatibility

- The existing thumbnail/video media service is reused. Uploads require saving a draft first, saved references are loaded when reopening an editor, replacement/removal controls are present, thumbnail fallback is safe, and promotional videos remain optional and non-autoplaying. Cloud upload remains mocked; no R2 operation was performed.
- Target-audience is not a Product schema/API field in the current project. It was not added or folded into unrelated text. The external seed source must clarify whether that information is required before a schema decision.
- The data model can represent the ten expected records without new product-type changes: Whole Money Tree Bundle (`pdf_bundle`/`bundle`); Freelance Starter Kit (`pdf_bundle`/`starter_kit`); the seven named downloadable guides (`pdf`); and 1:1 Clarity Call (`call_guidance`). These are field mappings only; no values or records were created. Actual copy, INR prices, category IDs, PDF files/assets, SEO, and publish readiness still need owner-supplied data.
- Older paid `video` and `video_and_files` formats remain unsupported. A promotional video URL is only preview media. Do not import those legacy formats as paid products without the Phase 6 owner decision.

## Verification results

- `npm run test:catalog`: 69 tests passed after adding the compare-at clearing regression.
- `npm run test:admin`: 16 authorization/bootstrap policy tests passed; no bootstrap or role change occurred.
- `npm run test:browser`: 2 local Chromium component tests passed. The admin listing test covers valid, empty, malformed, no-thumbnail, legacy, multiple, loading, category, compare-at, and featured rendering. The media test covers video/thumbnail presentation. Neither uses an authenticated session or database.
- `npx tsc --noEmit` and `npm run lint`: passed.
- Plain `npm run build` failed because the local `.env.local` sets `PUBLIC_MEDIA_BASE_URL` to an `r2.dev` endpoint, rejected in production mode. `.env.local` was not modified. With a temporary reserved `https://media.example.invalid` override and dummy localhost MongoDB URI, `npm run build` passed. It emitted two sanitized `admin.api.request_failed` dashboard-count events because the dummy DB was unavailable; this remains a separate unresolved diagnostic.
- With those same temporary non-production overrides, `npm run test:smoke` passed: public routes, metadata, sitemap/robots, and unsigned webhook rejection. The admin product route was not part of that authenticated journey.
- No real database records were read, written, or seeded; no authenticated admin browser, real PDF upload, Cloudflare R2, Cashfree, Resend, or deployment was exercised.

## Owner browser checklist

Using a disposable non-production database and approved test media only:

1. Open `/admin/products`, create a draft, and verify it appears once.
2. Reopen, change name/slug/descriptions/pricing/category, clear compare-at price, save, refresh, and confirm persisted values.
3. Upload/replace/remove a thumbnail and optional video with configured test R2; verify the card uses the thumbnail and detail video is paused with a poster.
4. Assign an existing private test PDF; verify missing/foreign assets cannot publish.
5. Create a valid PDF bundle and test rejection for nested, call, duplicate, and unpublished items.
6. Publish only after valid relationships/assets, verify `/products` and its detail, then unpublish and archive. Confirm history-bearing products cannot be permanently deleted.
7. Repeat at 390px, 768px, and 1440px, including keyboard navigation and light/dark themes.

Keep those results `NOT_RUN` until the owner confirms them. Do not use production records.
