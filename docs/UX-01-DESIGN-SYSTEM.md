# UX-01 — Refined Editorial Commerce foundation

**Status: PASS — local implementation; authenticated acceptance pending (UX-01R, 25 November 2026).** The approved visual foundation is implemented locally and tested on public routes. The product-detail prerender warning and anonymous CDP runner timeout were corrected in UX-01R; see [closure matrix](UX-01R-CLOSURE.md). Owner/customer authenticated visual acceptance remains pending. No commerce, authentication, payment, email, database, dependency or deployment change was made.

## Baseline and direction

UX-00 files were read before implementation. The branch remains `staging`; existing uncommitted source and copy edits were preserved. The visual direction keeps the navy/orange identity, editorial headline, paper-style hero art and English interface. The existing Motion reveal, cart provider, Better Auth, purchase consent and product data remain intact.

Before screenshots are in `docs/ux-audit/`; after screenshots are in `docs/ux-01-screenshots/`. True 390px captures use CDP device metrics, because Chrome `--window-size=390` alone actually creates a 504px layout viewport. Representative comparisons: [home before](ux-audit/home-390-cdp.png) / [after light](ux-01-screenshots/home-390-light.png) / [after dark](ux-01-screenshots/home-390-dark.png); [catalogue before](ux-audit/products-1440.png) / [after dark](ux-01-screenshots/products-1440-dark.png) / [mobile product card](ux-01-screenshots/catalog-card-390-light.png); [detail before](ux-audit/product-detail-390-cdp.png) / [after](ux-01-screenshots/detail-390-light.png). [Open mobile menu](ux-01-screenshots/mobile-menu-390.png) shows the full-width action after refinement. Captures are anonymous first views, not transaction tests.

## Token system

Source of truth: `src/app/globals.css`. Existing light/dark brand values are preserved. Added semantic danger, warning, focus and skeleton colors; card/elevated shadows; quick/standard motion durations and easing; and header/dialog layering tokens. Theme variables supply all new card, field and button primitives. The orange primary button has fixed navy text in both themes; this was explicitly checked in Chrome after a dark-theme contrast regression was caught and corrected.

| Pattern | Implementation |
|---|---|
| Layout | `.mt-container`: centered 85rem maximum, 20/32/48px inline padding at mobile/tablet/desktop. The product detail retains its narrower `max-w-6xl` utility. |
| Typography | `.mt-display`: balanced 44–90px editorial headline, 1.02 line height and tight tracking. `.mt-eyebrow`: small uppercase accent label. Existing Geist/system font stack retained. |
| Surfaces | `.mt-card` uses semantic surface, border, 20px radius and soft shadow. `.mt-card-interactive` adds restrained hover/focus elevation; motion remains optional under reduced-motion rules. |
| Buttons | `.mt-button` enforces 44px target and common spacing; primary/outline variants have semantic states. Disabled state is visibly subdued. Text contrast on primary orange is navy in light and dark. |
| Inputs | `.mt-field` has a persistent border and focus halo; existing visible labels and validation messages remain. |
| Focus | Global `:focus-visible` is 3px in semantic focus color. Mobile menu Escape restores visible focus to the toggle. |
| Loading | `.mt-skeleton` color token is available for future content-aligned skeletons. Existing Suspense/loading behavior was not replaced in UX-01. |
| Motion | 160ms quick, 240ms standard, cubic-bezier(0.22,1,0.36,1). Existing `Reveal` remains the only Motion component used here. Global reduced-motion override stays active. |

## Applied visual changes

- Header/footer/hero share the new container width and responsive spacing. Header and hero CTAs use button primitives. The mobile menu action occupies its own full-width row instead of wrapping within a three-column row.
- Catalogue uses the shared container, eyebrow, field, card and button styles; card elevation respects focus and reduced motion. Search, filters, sort, pricing and API behavior were not changed.
- Product detail uses the same container, balanced heading and framed media surface. Product copy and prices are still sourced from the existing product record; no user-entered description was rewritten.
- The mobile filter panel is still tall at 390px. A collapsible filter treatment would affect discoverability and filter semantics, so it is deferred to UX-05 rather than rushed into UX-01.

## Verification

- `node --test tests/ux/design-foundation.browser.test.mjs`: **1/1 pass** after the final visual changes. Chrome CDP verified no document horizontal overflow at 320, 390, 768 and 1440px on `/products`; menu opens, Escape closes it and restores visible focus; theme switch gives the dark body and navy-on-orange primary text; reduced-motion media query suppresses transitions.
- `node --test tests/browser/homepage.test.mjs tests/browser/product-media.browser.test.mjs`: **2/2 pass**. These are local component/HTML fixture checks, not live payment or authenticated journeys.
- Application TypeScript (`tsc --noEmit`) **pass**; test TypeScript (`tsc -p tsconfig.env-test.json --noEmit`) **pass**; focused ESLint **pass**; JS syntax check **pass**; `git diff --check` **pass**.
- `npm.cmd run build`: **pass**, Next 16.4.6 compiled and generated **55/55** pages. This is a build, not production runtime or staging verification.
- Existing `tests/e2e/local-journey.test.mjs` stopped at its prior **CDP `Page.enable` timeout before application navigation (0/1)**. It does not establish a UI regression; the new focused Chrome CDP browser test passed.
- Public-route screenshots at 390 and 1440 show usable light/dark styles. No new horizontal overflow was measured at sampled widths. Populated cart/checkout, authenticated account/admin, keyboard traversal beyond the menu, screen reader, contrast audit and real Core Web Vitals remain **NOT_VERIFIED**.

## Historical issue found while investigating the development overlay

The small `N` badge is Next.js development tooling. The earlier red “1 Issue” was a real prerender warning from metadata loading MongoDB before a request-time boundary. UX-01R added `await connection()` in `generateMetadata` before the data read. The focused browser route test passed with no `Date.now()` warning, the refreshed [390px detail capture](ux-01-screenshots/detail-390-light.png) has no red overlay, and the 55/55-page build passed. This resolves the observed local defect; it does not verify an authenticated production runtime.

## Files and next scope

UX-01 edited `src/app/globals.css`, `src/components/layout/navbar.tsx`, `footer.tsx`, `src/components/home/hero-section.tsx`, `src/components/catalog/product-catalog.tsx`, `product-main-media.tsx`, and `src/app/products/[slug]/page.tsx`; added `tests/ux/design-foundation.browser.test.mjs` and this report; captured `docs/ux-01-screenshots/`; appended `docs/TEST-REGISTER.md` and `NEXT_TASK.md`. Existing earlier modifications to hero, footer and detail copy were preserved.

**Recommended UX-02:** first resolve the product detail prerender warning under a targeted route task, then refine homepage section rhythm and product discovery using the established tokens. Keep mobile filter redesign for UX-05 and protected checkout/account/admin visual work for later subphases. No new animation dependency is needed.
