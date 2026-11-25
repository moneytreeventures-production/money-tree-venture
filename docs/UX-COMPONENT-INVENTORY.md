# UX component inventory — UX-00

**Evidence:** paths and behavior were inspected in source on 25 November 2026. Only home, catalogue, one product detail, empty cart and empty checkout were visually captured at 390px/1440px. Other rendered states are **unverified**. “Engine” is a proposal, not installed implementation.

| Existing component | Current role and interaction | Suggested primary engine / treatment | Risk and target |
|---|---|---|---|
| `src/components/ui/reveal.tsx` | Client Motion `whileInView` reveal; calls `useReducedMotion`. | Keep Motion; audit first-paint visibility before reuse. | Medium, UX-01 |
| `src/components/layout/navbar.tsx` | Client navigation, session-based account/admin label, cart count, mobile toggle/Escape. | CSS for menu and focus; no added animation until overflow fixed. | High, UX-01 |
| `src/components/layout/footer.tsx` | Server explore/legal link groups. | CSS only; inspect 320–430 and dark. | Medium, UX-01 |
| `src/components/layout/theme-toggle.tsx` | Client three-state light/dark/system cycle. | CSS only; expose current/next mode more clearly. | Medium, UX-01 |
| `src/components/home/hero-section.tsx` | Editorial layered mock cards, CTAs, `Reveal`. | CSS layout + restrained existing Motion. | High, UX-01 |
| `src/components/home/featured-products.tsx` | Request-time catalogue, product cards. | CSS card states; optional one Motion entrance. | High, UX-01 |
| `src/components/home/how-it-works.tsx` | Learning/purchase steps. | CSS only; preserve reading order. | Low, UX-01 |
| `src/components/home/trust-section.tsx` | Trust/benefit content. | No animation; copy must remain evidence-based. | Medium, UX-01 |
| `src/components/home/home-reviews.tsx` | Request-time approved reviews. | CSS only; avoid cumulative layout shift. | Medium, UX-01 |
| `src/components/catalog/product-catalog.tsx` | Client search/filter/sort, cards, API states. | CSS transitions; no animation on result updates until focus/announcement verified. | High, UX-01 |
| `src/components/catalog/product-main-media.tsx` | Client product image/video presentation. | Native media + CSS; respect bandwidth and controls. | High, UX-01 |
| `src/components/catalog/product-purchase-action.tsx` | Ownership check, add to cart, purchase-again consent. | No animation during validation; CSS button feedback. | Critical, UX-01 |
| `src/components/catalog/product-reviews.tsx`, `review-form.tsx` | Ratings, review submission. | CSS only; preserve verified-purchase gating. | Medium, later UX |
| `src/components/cart/cart-provider.tsx` | Sole browser cart state and persistence. | No visual treatment; do not replace. | Critical, later UX |
| `src/components/cart/cart-page.tsx` | Item list, coupon preview, unavailable state, totals. | CSS hierarchy/skeleton; no amount-counting animation. | Critical, later UX |
| `src/components/checkout/checkout-start.tsx` | Auth, preview, order creation, consent. | No animation on price/payment state; CSS progress hierarchy. | Critical, later UX |
| `src/components/checkout/hosted-checkout.tsx` | Phone, Cashfree initialization and redirect. | No animation beyond accessible pending indicator. | Critical, later UX |
| `src/components/checkout/payment-result.tsx`, `payment-status-check.tsx`, `retry-expired-order.tsx` | Verified success/failure/processing, polling, safe retry. | No animation for state inference; restrained CSS state entry only. | Critical, later UX |
| `src/components/account/account-shell.tsx`, `account-resources.tsx`, `order-history.tsx` | Account navigation, library/download, booking and order interactions. | CSS cards/tabs and consistent loading; no private data prefetch across users. | High, later UX |
| `src/components/auth/login-panel.tsx`, `sign-out-button.tsx` | Better Auth Google sign-in/session/sign-out. | CSS focus and status; no animation during redirects. | Critical, later UX |
| `src/components/admin/admin-navigation.tsx`, `admin-products.tsx`, `admin-categories.tsx`, `coupon-manager.tsx` | Owner tools and dense management forms. | CSS responsive density; product editor needs focus-trap/escape audit. | High, later UX |
| `src/components/admin/admin-bookings.tsx`, `admin-reviews.tsx`, `support-inbox.tsx`, `email-testing-panel.tsx` | Owner lifecycle, moderation, support and controlled email tests. | CSS status/feedback; no motion on consequential actions. | High, later UX |
| `src/components/pages/public-info-page.tsx`, `localized-info-page.tsx`, `contact-form.tsx`, `legal-source-language-notice.tsx` | Public/legal prose and contact submission. | CSS typography and accessible sections; preserve draft/legal caveats. | High, later UX |
| `src/app/globals.css` | Semantic light/dark tokens, global focus and reduced-motion rules. | CSS design-system refinement. | High, UX-01 |

## Interaction technology assessment

**Primary strategy:** CSS/Tailwind for layout, state and microinteractions. Use existing Motion only for optional editorial reveals after measuring first paint and honoring reduced motion. GSAP/ScrollTrigger is not installed and is unnecessary for the identified work. Aceternity is not installed; copying a candidate should be justified by measured benefit and accessibility review, not visual novelty.

| Aceternity candidate | Assessment and exact possible location |
|---|---|
| Background Beams | Unsuitable for `HeroSection`; could compete with copy and add paint cost. |
| Animated Beam | Optional only for an isolated “how it works” illustration; static connecting line is preferable. |
| Card Spotlight | Optional on featured product cards, but hover-only affordance must not hide content and needs touch fallback. |
| Tracing Beam | Unsuitable for legal/contact pages; reading content should remain calm. |
| 3D Card | Unsuitable for product purchase cards; motion, perspective and touch behavior add risk. |
| Animated Tabs | Redundant with existing accessible order filters; use CSS state instead. |
| Moving Border | Unsuitable for checkout/payments; may imply a live status or distract from verified state. |

Any future effect should render stable HTML on the server, avoid browser-only values during hydration, have a static CSS/mobile/reduced-motion fallback, and preserve keyboard focus and semantic controls.
