# Phase 9 - Dynamic homepage and branded 404

Implemented 2026-11-21. Implementation is complete with partial verification. Live database journeys and the route-level responsive browser matrix remain NOT_RUN.

## Implementation

The hardcoded featured-products array and artwork cards were removed. The async server component calls the existing listPublicProducts service with page 1, pageSize 6 and featured sorting. Existing filtering enforces published status. Existing ordering is featured descending, displayOrder ascending, createdAt descending and _id descending. Other published products fill remaining slots consistently with catalogue ordering. The existing product_public_featured_order index supports this query; index application remains an integration task.

connection() and a homepage Suspense boundary defer access to request time. There is no new public-data cache or invalidation requirement. Empty results and query failures have distinct English states, with a sanitized homepage.products.load_failed event. Only explicit public display fields and cart identifiers cross client boundaries. Cards use existing media and purchase components, real prices, optional compare-at prices and encoded slug links. Promotional video is omitted from cards.

How-it-works copy now explains exploration, Google sign-in, purchase and account access. Existing navbar/footer routes, active states, menu-close handlers and trusted account authorization remain in place. Existing footer destinations correspond to public routes. No new authorization query was added.

The root not-found page includes branding, navbar/footer, 404, Page Not Found, Return Home and Explore Products. Existing product notFound() handling and published-only slug lookup are retained. Product loading text is now English.

## Verification

- TypeScript: node_modules\.bin\tsc.cmd --noEmit --incremental false passed.
- ESLint: npm.cmd run lint passed.
- npm.cmd run test:catalog passed; existing publication, query, category, product and media coverage.
- npm.cmd run test:admin passed, 18 tests.
- npm.cmd run test:browser passed, 4 existing Chromium component fixtures.
- node --test tests/browser/homepage.test.mjs passed, one mocked server-rendering test covering bounded service arguments, empty/error states, price, product links, cart ID and omitted video.
- npm.cmd run build with existing media configuration and dummy localhost DB failed on the known r2.dev production validation.
- Isolated npm.cmd run build passed using PUBLIC_MEDIA_BASE_URL=https://media.example.com, MONGODB_URI=mongodb://127.0.0.1:1/phase9 and MONGODB_DB_NAME=phase9. Two sanitized admin errors reflect the unavailable dummy DB.
- Isolated npm.cmd run test:smoke passed after adding serverSelectionTimeoutMS=500 and connectTimeoutMS=500 to the process-only dummy Mongo URI. Initial smoke timed out while awaiting DB failure.
- /this-page-does-not-exist returned HTTP 404, branded UI and noindex.
- /products/INVALID_SLUG returned HTTP 200, branded UI and noindex. This malformed slug needs no database access. ProductContent runs behind Suspense after the shell starts streaming. Moving the DB lookup outside this boundary would conflict with Cache Components request-time rendering. The supported notFound mechanism is retained.
- Syntactically valid missing, draft and archived slug HTTP checks against actual MongoDB are NOT_RUN. Existing service tests cover public visibility restrictions.
- Actual 390/768/1440 light/dark route browser matrix, keyboard/contrast/overflow/hydration inspection and valid-record homepage-to-cart journeys are NOT_RUN. Existing browser fixtures do not establish those results.
- git diff --check passed with existing CRLF notices, limited to tracked changes.

## Files changed

src/app/page.tsx; src/app/not-found.tsx; src/app/products/[slug]/page.tsx; src/components/home/featured-products.tsx; src/components/home/how-it-works.tsx; tests/browser/homepage.test.mjs; scripts/smoke-production.mjs; this report; PROJECT-TRACKER.md; REQUIREMENTS-MATRIX.md; TEST-REGISTER.md; LAUNCH-READINESS.md; NEXT_TASK.md.

## Outstanding work

Real Cloudflare R2 uploads, production HTTPS media domain, actual MongoDB catalogue/search and text-index application, Phase 6 seed approval/apply, eight unsupported paid-video mappings, Cashfree sandbox, private PDF delivery, legal review and broader end-to-end tests remain open. No products were seeded or published, production records accessed, or deployment performed.

The owner's current Phase 9 assignment supersedes earlier provisional roadmap numbering for these features. Historical Phase 0-8 reports remain intact. Phase 10 reviews and moderation is next upon owner instruction, with the above verification gaps carried forward.
