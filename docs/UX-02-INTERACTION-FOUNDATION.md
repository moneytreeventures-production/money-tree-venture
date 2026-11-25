# UX-02 — Shared interaction foundation

**Status: locally implemented; authenticated visual acceptance pending.** 25 November 2026, branch `staging`. This work adds presentation primitives and connects them to existing loading and editor states. It does not change cart, checkout, payment, authentication, database or email behavior. UX-03 has not started.

## Reused architecture and components

- Existing Next.js 16 Cache Components and Suspense boundaries remain in place. The home, catalogue, account and admin Server Components still load data on the server; their fallbacks now use static skeleton markup. No `use cache` or client-side data migration was added.
- Existing `motion/react`, theme tokens, cart provider, inline feedback and admin product editor were reused. `Reveal` remains the single content-reveal component. No dependency was installed.
- The admin product editor now uses `AccessibleOverlay`; its form, save/delete authorization, prices and product operations were not changed.

## Primitives and integration map

| Primitive | Purpose and integration |
|---|---|
| `Skeleton`, `SkeletonText`, `SkeletonMedia`, `SkeletonProductCard`, `SkeletonProductGrid` | Static theme-aware placeholders. Catalogue media reserves its 1.55:1 frame; featured cards reserve their 4:3 frame. |
| `FeaturedProductsSkeleton`, `CatalogueSkeleton` | Home featured-products and `/products` Suspense fallbacks. Client catalogue refresh also uses the grid skeleton. |
| `SkeletonCartSummary`, `SkeletonCheckoutSummary` | Existing cart hydration and checkout session-loading branches. Empty and error branches stay distinct. |
| `SkeletonAccountContent` | Existing account and library Suspense fallbacks; private data remains within the authenticated Server Component. |
| `SkeletonDataTable`, dashboard card skeleton | Admin product-list loading and dashboard counts. Existing owner gate remains outside data rendering. |
| `Feedback` | Tone-based loading/success/error/warning/empty presentation. Catalogue error and empty states demonstrate reuse, including an explicit retry action. It never infers business success from animation. |
| `AccessibleOverlay` and `activateOverlay` | Shared labelled dialog/drawer surface; product editor demonstrates the dialog variant. The controller makes background siblings inert, traps focus, closes the topmost overlay on Escape, restores prior focus, locks body scrolling and restores it after the final overlay closes. Backdrop closes only when the backdrop itself is clicked. |

Skeleton regions expose exactly one `role=status` text announcement; decorative blocks are hidden from assistive technology. No skeleton covers already rendered server content. Placeholders use the existing light/dark `--skeleton` token and have no continuous animation, so reduced-motion needs no special skeleton state. No artificial loading delay was added.

## Motion and feedback rules

`src/components/ui/motion-patterns.ts` centralizes hover, press, fade, slide, reveal, layout, modal, drawer and toast geometry/durations. CSS handles ordinary button/card hover and focus transitions using existing 160/240ms tokens. `Reveal` now renders semantic content visibly in server HTML (`initial={false}`); once in view it uses a small transform-only entrance. Reduced-motion removes its duration. Overlay enter/exit geometry uses the shared patterns; reduced-motion sets duration to zero after hydration. No pointer-tracking state or perpetual animation was added.

`Feedback` uses `role=alert` for blocking errors, `role=status` for loading/success/warning and no live announcement for a passive empty state. The caller owns the actual business state and retry operation. Payment outcomes are not rendered through this new component.

## Verification and screenshots

| Check | Actual result | Limit |
|---|---|---|
| `node --test tests/ux/interaction-foundation.test.mjs` | 5/5 pass after the final overlay correction | Static rendering plus an isolated real-Chromium DOM test of background inertness, focus, Escape, nesting, restoration and scroll lock. It is not an authenticated editor journey. |
| `node --test --test-concurrency=1 tests/ux/interaction-foundation.test.mjs tests/ux/design-foundation.browser.test.mjs` | 6 pass, 1 skip, 0 fail on final local run | Real browser checks sample 320/390/1440px skeleton dimensions, light/dark colors, reduced motion, route overflow, menu keyboard behavior and public-route hydration. Product-detail data subcheck skipped because the local published-product API was unavailable during a MongoDB DNS SRV timeout. An earlier run with the API available passed 7/7 before the final overlay/fixture correction. |
| `npm.cmd run test:browser` | 8/8 pass | Existing browser component fixtures, including admin product listing and checkout controls. |
| `node --test tests/e2e/local-journey.test.mjs` | 9 pass, 1 skip, 0 fail | Public R2 poster check remains blocked by agent-browser network access; no order or payment was created. |
| Application/test TypeScript, focused ESLint | Pass | Local static checks only. |
| `npm.cmd run build` | 55/55 pages generated after the final overlay correction | Local production-mode build; deployed runtime not tested. |

Screenshots: [390px light cart skeleton](ux-02-screenshots/skeleton-cart-390-light.png) and [390px dark cart skeleton](ux-02-screenshots/skeleton-cart-390-dark.png). They show the isolated skeleton inserted in a public browser page using the app's actual stylesheet; they are not screenshots of a signed-in customer cart. The screenshot test measured no horizontal overflow and distinct theme colors. No actual CLS or Core Web Vitals measurement was made.

## Files modified

New: `src/components/ui/skeleton.tsx`, `feedback.tsx`, `motion-patterns.ts`, `overlay-controller.ts`, `accessible-overlay.tsx`, `tests/ux/interaction-foundation.test.mjs`, this report and `docs/ux-02-screenshots/`.

Updated: `src/components/ui/reveal.tsx`, home/products/account/library/admin pages, catalogue/cart/checkout/admin-products components, `tests/ux/design-foundation.browser.test.mjs`, `docs/TEST-REGISTER.md`, `docs/UX-RISK-REGISTER.md` and `NEXT_TASK.md`.

## Performance and remaining acceptance

Skeletons are static Server Component markup, with no timer, polling or extra data request. The editor overlay adds client code only to the existing client admin editor. No bundle-size or real Web Vitals benchmark was performed. The shared overlay supports entrance and exit when kept mounted with `open` toggled; the current editor unmounts on close, so it uses the entry behavior and immediate exit. Authenticated owner/customer mobile and desktop checks remain pending: verify editor focus and backdrop in an approved signed-in session, account/library loading, light/dark themes, screen-reader announcements and browser console. Public media reachability also requires an accessible owner browser.

The final browser attempt exposed an intermittent local MongoDB DNS SRV `ETIMEOUT` while loading published product data. The public shell and loading-state checks passed; the unavailable product API was correctly skipped, not treated as a UI success. The route test now waits for either actual content or its accessible loading state instead of waiting for every database-backed stream to finish. An isolated Chrome fixture confirmed the overlay needs background inertness in addition to event-based focus handling; that correction is included. Application/test TypeScript, focused ESLint, JavaScript syntax, `git diff --check` and the final 55/55-page build passed. An earlier parallel browser run had an overlay focus-fixture failure; the inertness correction and sequential final run resolved it.

UX-03 can reuse these primitives in its feature-specific screens. It must preserve server-verified payment states, cart rules and auth gates, and requires a separate owner instruction. Do not treat this foundation as approval for a cart drawer or deployment.
