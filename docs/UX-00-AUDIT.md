# UX-00 repository and visual audit — 25 November 2026

**Status: PASS — audit and anonymous baseline delivered (UX-01R, 25 November 2026).** This is an audit, not implementation or launch approval. UX-01R added public-route checks at 320, 390, 768, 1024, 1440 and 1920px, light/dark contrast, keyboard menu/focus and reduced motion; see [closure matrix](UX-01R-CLOSURE.md). Authenticated visual checks, screen reader and measured Core Web Vitals remain separately unverified.

## Evidence and baseline

- Branch `staging`; `git status --short` showed 45 modified tracked paths and 16 untracked paths before this audit. They were preserved. The four UX documents and `docs/ux-audit/` are the only UX-00 additions.
- Installed: Next 16.4.6, React 19.3.0, TypeScript 5.9.3, Tailwind 4.3.3, Motion 14.14.0, next-themes 0.4.6, Lucide 1.73.0, Better Auth and Mongo adapter 1.7.25. `package.json`, lockfile and installed package metadata agree. No installed GSAP, Aceternity, Radix or shadcn component set was found. Existing browser tools are Chrome/CDP scripts in `tests/e2e` and HTML browser fixtures in `tests/browser`.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`. Pages/layouts are Server Components unless marked otherwise; cart, catalogue, payment, account actions and admin editors are Client Components. Root layout provides theme and cart context. Home, products, account and payment pages have Suspense fallbacks; several call `connection()` in a Suspense child. Installed Next guidance on Server/Client Components, partial prefetching and authentication with Cache Components was read. No `loading.tsx` or `error.tsx` routes were found. `use cache` was not found in the inspected app/component tree.
- Local anonymous GET `/` returned 200 in 474 ms and `/products` returned 200 in 172 ms in one warm dev-server probe. These are HTTP timings, **not** LCP, INP, CLS, production performance or evidence of healthy database content. `/api/products` returned one published product to a read-only query.
- Captured Chrome screenshots: [home 390](ux-audit/home-390-cdp.png), [home 1440](ux-audit/home-1440.png), [products 390](ux-audit/products-390-cdp.png), [products 1440](ux-audit/products-1440.png), [product detail 390](ux-audit/product-detail-390-cdp.png), [product detail 1440](ux-audit/product-detail-1440.png), [empty cart 390](ux-audit/cart-390-cdp.png), [empty checkout 390](ux-audit/checkout-390-cdp.png). These are anonymous light-theme first-view images, not complete interaction tests. The detail screenshot shows a development overlay; its underlying issue was not diagnosed in UX-00.
- Chrome `--window-size=390` alone created a **504px layout viewport**, so those initial captures were discarded. The retained 390px captures use CDP `Emulation.setDeviceMetricsOverride`; measured `innerWidth` and document `scrollWidth` were both 390 on all five sampled routes. No horizontal overflow was observed there. The 1440px homepage hero, navigation and catalogue filter layout are coherent. Populated cart, paid/failed results and admin were not captured.

## Route review

Evidence codes: **S** = source inspection; **B** = actual screenshot above; **U** = rendered state unverified. For each route, “shared” means the responsive/theme shell uses `Navbar`, `Footer` and CSS variables where present. Source-based descriptions of layout are not claims about rendered appearance. The security rules in the final column are hard boundaries for any UX change.

| Route and page file | Components, boundary, hierarchy and actions | States; mobile, theme, accessibility, performance; proposed improvement and guard | Evidence |
|---|---|---|---|
| `/` `src/app/page.tsx` | Server shell; `HeroSection`, featured products, how-it-works, trust, reviews; hero CTAs and product links. | Suspense for products/reviews; shared theme. 390 and 1440 first view fit. Refine product discovery; preserve published catalogue rules. | S+B |
| `/products` `src/app/products/page.tsx` | Server shell, client `ProductCatalog`; title, search, category/type/price/sort filters, cards, cart link. | Suspense loading; client API empty/error paths. 390 filter panel is tall but fits; 1440 filters fit in one row. Keep server-published prices and availability. | S+B |
| `/products/[slug]` `src/app/products/[slug]/page.tsx` | Server data/metadata with request-time child; media, reviews, purchase action. | Loading and not-found; 390 copy/price region fits, but screenshot shows a development overlay. Media currently appears as video for sampled product. Preserve purchase-again authorization and user-entered product copy. | S+B |
| `/cart` `src/app/cart/page.tsx` | Server shell, client `CartPage`; list, coupon, summary, checkout. | Hydration/loading, empty, unavailable, API error, coupon feedback. Empty 390 layout fits. Keep `CartProvider`, server quote, quantity=1 and checkout consent. | S+B |
| `/checkout` `src/app/checkout/page.tsx` | Server shell, client `CheckoutStart`; cart review, consent, order creation, login path. | Loading, empty, auth error, submission error. Empty 390 layout fits. Keep auth, idempotency, server pricing and explicit repurchase consent. | S+B |
| `/checkout/[orderId]` `src/app/checkout/[orderId]/page.tsx` | Server order snapshot, client hosted checkout/status/retry. | Suspense, pending/failed/expired/paid messaging and navigation. Rendered states U. Do not imply paid before provider verification or offer unsafe retry. | S+U |
| `/checkout/return` `src/app/checkout/return/page.tsx` | Server return mapping, client `PaymentResult`. | Suspense and success/failure/processing states with bounded status checks. Rendered states U. Keep authenticated order mapping and provider verification. | S+U |
| `/login`, `/admin/login` `src/app/login/page.tsx`, `src/app/(public)/admin/login/page.tsx` | Server shell, client Google `LoginPanel`. | Suspense, pending, unavailable/error, signed-in actions. Mobile/theme U. Preserve Better Auth, callback safety and owner-only admin. | S+U |
| `/account` `src/app/account/page.tsx` | Server authorized account, `AccountShell`, summary cards. | Suspense, recent activity/empty content. Mobile/theme U. Keep session-scoped data private. | S+U |
| `/account/library` `src/app/account/library/page.tsx` | Server account shell, client `AccountResources` downloads. | Suspense, available/pending/failed copy states. Mobile/theme U. Keep entitlement and signed private file delivery. | S+U |
| `/account/orders` `src/app/account/orders/page.tsx` | Server account shell, client `OrderHistory` tabs/cards/status/archive. | Suspense, empty, processing/error. Mobile/theme U. Keep ownership and historical snapshot truth. | S+U |
| `/account/bookings` `src/app/account/bookings/page.tsx` | Server account shell, client booking resources. | Suspense, availability/scheduling states. Mobile/theme U. Keep booking lifecycle and ownership. | S+U |
| `/admin` `src/app/admin/page.tsx` | Owner-gated server dashboard under `admin/layout.tsx`; metrics/manage links. | Suspense fallback and request-time `connection()`. Authenticated rendering U. Keep owner gate before any data. | S+U |
| `/admin/products` `src/app/admin/products/page.tsx` | Server wrapper, client `AdminProducts`; filters, rows, editor/media dialog. | Loading/empty/error/feedback; dialog focus and narrow viewport need testing. Preserve CRUD, categories and private/public media isolation. | S+U |
| `/admin/categories` `src/app/admin/categories/page.tsx` | Server wrapper, client `AdminCategories`; list/editor/status. | Empty/error/loading in client; mobile and keyboard U. Preserve category rules and owner authorization. | S+U |
| `/admin/coupons` `src/app/admin/coupons/page.tsx` | Server wrapper, client `CouponManager`; create/list/deactivate. | Feedback/loading; keyboard/mobile U. Preserve price, redemption and owner gates. | S+U |
| `/admin/bookings` `src/app/admin/bookings/page.tsx` | Server wrapper, client `AdminBookings`; booking update. | Status/update feedback; responsive U. Preserve scheduling state transitions. | S+U |
| `/admin/reviews` `src/app/admin/reviews/page.tsx` | Server wrapper, client `AdminReviews`; moderation. | Fetch/update states; responsive U. Preserve verified-purchase moderation. | S+U |
| `/admin/support` `src/app/admin/support/page.tsx` | Server wrapper, client `SupportInbox`; filters/detail/reply state. | Loading/error and narrow-view behavior U. Preserve private customer messages. | S+U |
| `/admin/email-testing` `src/app/admin/email-testing/page.tsx` | Suspense + owner gate + request-time connection, client panel. | Disabled/health/send feedback; rendered U. Never surface credentials or send without explicit controlled approval. | S+U |
| `/about` `src/app/about/page.tsx` | Server `PublicInfoPage`; editorial sections and footer links. | Shared layout; mobile/theme U. Preserve factual business claims. | S+U |
| `/contact` `src/app/contact/page.tsx` | Server shell + client contact form. | Submit/error/acknowledgement; mobile/theme U. Preserve privacy and required consent. | S+U |
| `/faqs` `src/app/faqs/page.tsx` | Server `LocalizedInfoPage` (legacy component name; English content). | Q&A sections, links; mobile/theme U. Preserve accurate purchase terms. | S+U |
| `/resources` `src/app/resources/page.tsx` | Server redirect to `/products`. | No independent UI; check redirect announcement/navigation. | S+U |
| `/terms`, `/privacy-policy`, `/refund-policy` | `src/app/{terms,privacy-policy,refund-policy}/page.tsx`; server `PublicInfoPage`. | Draft notices, headings, footer links; mobile/theme U. Final approved legal text missing; retain notices. | S+U |
| `/billing-information`, `/shipping-delivery` | `src/app/{billing-information,shipping-delivery}/page.tsx`; server `PublicInfoPage`. | Draft/legal caveats; mobile/theme U. Preserve tax/delivery accuracy; owner approval required. | S+U |
| Unmatched path `src/app/not-found.tsx` | Server custom 404, home/catalogue links. | Static recovery; mobile/theme U. Keep noindex behavior as previously established. | S+U |

The route tree also contains API route handlers, `robots.ts`, `sitemap.ts`, `layout.tsx`, `globals.css` and `favicon.ico`; they are not independent visual pages. The route inventory above covers every `page.tsx` in `src/app` plus the custom 404.

## Ranked UI/UX issues (customer impact)

1. **High, source:** live catalogue/product detail depend on API/database; fallback pages can look healthy while data fails. Add clearly distinct retry and empty states where needed.
2. **High, source:** checkout and payment processing rely heavily on text/spinners; make status hierarchy and safe recovery unmistakable without touching verification rules.
3. **High, source:** legal and billing pages remain drafts; polished visuals cannot imply final commercial approval.
4. **Medium, source:** no route-level `error.tsx` or `loading.tsx`; repeated hand-written loading copy and weak skeleton continuity.
5. **Medium, observed:** catalogue filter panel occupies much of the 390px first view, delaying product discovery.
6. **Medium, source:** header mobile navigation begins below `xl`, making menu behavior important across tablet/laptop widths; menu-open keyboard/focus not browser-verified.
7. **Medium, source:** admin product editor/dialog and dense filters lack authenticated narrow-view and keyboard evidence.
8. **Medium, source:** theme toggle cycles three modes with one icon and changing label; state discoverability and screen-reader clarity require testing.
9. **Medium, source:** animated reveal and multiple hover transforms are scattered; verify reduced-motion, initial content visibility and hydration before adding more animation.
10. **Medium, observed:** product detail shows a development overlay in the captured run; classify its cause before deciding whether it is a product defect.

## Performance, access and next phase

No Core Web Vitals, bundle size, layout-shift trace, console audit or screen-reader run was measured. Existing CSS has a global `:focus-visible` outline and reduced-motion rule; `Reveal` calls `useReducedMotion`. Verify actual keyboard focus, contrast, menu Escape behavior and theme switching at 390/1440 in UX-01. Current local screenshots are light theme only. Product detail image/video loading and server catalogue access may dominate perceived speed; measure before optimizing.

Outstanding blockers retained from prior reports: deployed outbox 401 and real confirmation delivery; Atlas/index/transaction readiness; production media custom-domain validation and private R2 isolation; staging OAuth/webhook/schedules; approved legal/GST/consultation terms; secret rotation; authenticated browser and Mongo concurrency checks. None is resolved by this audit.

**Proposed UX-01:** validate 320/360/430 and tablet widths, then refine responsive shell, hero, catalogue filters/cards and product detail. Diagnose the development overlay and improve loading continuity. Add real browser light/dark, keyboard and reduced-motion checks for these routes. Keep checkout, account and admin in later subphases. Owner should approve the visual direction and this scope before source changes. Proposed `NEXT_TASK.md` update: record UX-00 PARTIAL, links to four documents, corrected 390px baseline with no observed overflow, unverified scenarios and the UX-01 approval gate. This file was not edited.

Rollback: remove only the four new UX audit documents and `docs/ux-audit/` screenshots; no application code or pre-existing worktree changes were made by UX-00.
