# UX-00 risk register — 25 November 2026

## UX-02A authenticated acceptance checkpoint — 25 November 2026

| Risk | Evidence and mitigation | Remaining action |
|---|---|---|
| Protected-route visual acceptance is missing | Owner authorized manual Google sign-in. The harness passed anonymous checks and reached its sign-in prompt, but the Chrome window launched from the agent terminal was not visible on the owner's desktop. No auth was bypassed and no signed-in route was observed. | Owner runs the gated harness in an interactive desktop PowerShell session for both roles and records results. |
| Small account/admin touch targets | Source confirmed 36–40px navigation/product/purchase controls; frontend-only class correction reserves 44px and regression passed. Admin nine-link navigation now uses the compact menu below `xl`. | Measure actual controls and header layout in signed-in 320/390/768/1440px browser views. |
| Protected account screenshots can contain private data | No authenticated screenshot was captured or committed. | Keep screenshots redacted and outside Git; record only safe visual findings. |
| Production build during owner-managed dev runtime | UX-02A did not stop or restart the server. | Run a build after owner safely stops dev, or use a separately approved isolated build output. |


## UX-02 additions — 25 November 2026

| Risk | Current mitigation | Remaining verification |
|---|---|---|
| Static skeleton size differs from final data-dependent content | Catalogue and featured media aspect ratios match their actual cards; cart/checkout/account/admin placeholders reserve representative regions without delaying data. | Actual CLS and populated signed-in loading transitions remain unmeasured. |
| Product editor overlay focus and competing surfaces | Shared controller makes background inert, traps focus, restores it, handles topmost Escape and preserves body scroll state; isolated Chromium fixture passed. | Approved owner session must verify the full editor on mobile/desktop and with a screen reader. |
| Motion hides meaningful content before hydration | Reveal now emits visible semantic server HTML and uses transform-only entrance; reduced motion removes duration. | No-JS and assistive-technology manual review; no comprehensive performance trace. |
| Public media cannot load in this agent browser | Anonymous journey marks the exact poster check skipped after a network access error; other checks run. | Owner browser with public media reachability must confirm loaded dimensions. |
| Intermittent local MongoDB DNS SRV timeout | Public shell and loading state remained accessible; published-product browser subcheck skipped when the API could not respond. | Repeat database-backed product/metadata check from a healthy local network; do not claim it passed in the final run. |


**Scope:** UX proposals only. Verified facts cite inspected paths or captured screenshots; later checks are explicitly unverified. No security or business flow was changed.

| Risk / evidence | Severity | Mitigation before implementation | Required verification |
|---|---|---|---|
| Initial `--window-size=390` captures were cropped from a 504px layout viewport. UX-01R now uses true CDP metrics at 320, 390, 768, 1024, 1440 and 1920px on four anonymous routes; no horizontal overflow was measured. | Low residual | Keep CDP metrics for future viewport evidence. | Authenticated and populated states, 360/430px and manual visual review remain pending. |
| Better Auth session and owner-only admin policy (`src/app/admin/layout.tsx`, account pages). | Critical | Keep authorization on server; avoid session data in shared cache or decorative prefetch. | Owner and non-owner signed-in journeys, sign-out, no data leakage. |
| Product CRUD, categories, reviews and owner tools (`src/components/admin/*`). | High | Keep form contracts, validation and moderation; redesign only after dense-dialog focus audit. | CRUD regression and modal keyboard/focus test. |
| Cart persistence and explicit Purchase Again consent (`cart-provider.tsx`, `product-purchase-action.tsx`, `checkout-start.tsx`). | Critical | Keep cart as sole source of truth; never infer ownership client-side as final authority. | Cart persistence, duplicate/owned product and repurchase consent tests. |
| Server pricing, coupons and immutable order snapshots (`cart-page.tsx`, checkout services). | Critical | Display authoritative values; never animate or calculate trusted totals from browser input. | Price/coupon/retry regression and authenticated browser checks. |
| Cashfree verification, signed webhooks, retry/idempotency and refunds. | Critical | Payment state design must reflect server verification; no success from redirect query, no unsafe retry button. | Sandbox payment, pending/failed/paid, duplicate callback and refund checks. |
| Purchase claims, Mongo transactions and index readiness. Prior trackers say integration remains unverified. | Critical | Keep fail-closed index gates and migration safeguards; no UX workaround for missing indexes. | Isolated replica-set concurrency tests and read-only index verification. |
| Private R2 PDF masters, personalized copies and short-lived downloads. | Critical | Never use public media URL for private files or expose object keys in UI/HTML. | Cloudflare bucket isolation and signed download test. |
| Resend outbox, scheduled worker and deployed 401 remain unresolved in existing docs. | High | Keep one-event dedupe and worker authentication; avoid UI claims that mail was delivered when only queued/accepted. | Protected worker and one approved live email test after deployment. |
| Consultation booking status and customer ownership. | High | Preserve requested/scheduled/confirmed distinctions and owner actions. | Authenticated booking lifecycle checks. |
| Legal/GST/refund/grievance information is draft or unapproved (`PublicInfoPage`, policy pages). | Critical launch gate | Retain draft notice and existing legal meaning; only use owner-approved final documents. | Owner/legal/tax sign-off and footer-link review. |
| Theme and contrast. UX-01R captured 390/1440 light and dark public views and measured primary CTA and heading contrast at 390px in both themes. | Medium residual | Check all text, borders and status colors before a full accessibility claim. | Manual color/assistive technology review and authenticated routes. |
| Motion/reduced-motion and hydration. UX-01R fixed a public-home hydration mismatch from `Reveal` reading motion preference differently on server/client. Reduced-motion hero visibility and no hydration warnings passed in the focused browser check. | Medium residual | Preserve stable first render and visible reduced-motion content. | No-JS and screen-reader review, plus authenticated route console checks. |
| Catalogue and homepage data availability. Source uses request-time MongoDB loaders; previous phase reports intermittent Atlas DNS issues. | High | Reserve stable loading space and truthful retry/empty states; do not mistake fallback 200 for working content. | Real catalogue API and page data at stable local/staging runtime. |
| Performance. Only two warm HTTP timings were captured, no Web Vitals or bundle analysis. | Medium | Measure before adding interactive libraries; prefer CSS and existing Motion. | LCP, CLS, INP, JS bundle, image/video weight and network trace at mobile/desktop. |
| SEO/cache boundaries (`next.config.ts`, root metadata, public/private routes). | High | Keep private no-store and noindex; do not cache session-specific pages in shared scope. | Metadata/robots and authenticated cache-boundary tests. |
| Staging prerequisites: approved HTTPS origins, public media custom domain, R2 isolation, Netlify worker scopes, OAuth/webhook and secret rotation. Existing Phase 20–22 reports mark these pending. | Critical launch gate | Carry forward blockers; visual milestone cannot clear deployment readiness. | Owner configuration review and deployed integration verification. |
| Product detail metadata read MongoDB before entering a request-time boundary, producing a Next.js prerender `Date.now()` warning. Resolved locally in UX-01R with `await connection()` before metadata data loading. | Resolved locally | Keep the metadata request boundary and focused route regression test. | Focused Chrome route test 2/2, refreshed detail capture without red overlay and 55/55-page build passed; staging runtime remains unverified. |

## Verification gaps and rollout order

Authenticated account/admin, populated cart, booking and payment-result states were not captured. Public 390/1440 dark-theme views were captured in UX-01R. The sampled product's stored description contains Hinglish; it is product data and must be reviewed by the owner, not automatically translated during UX work. The product-detail red development overlay was traced to metadata's missing request-time boundary and resolved locally. The anonymous journey's public R2 poster check remains blocked by this agent browser's network access; owner browser verification is still required. See `docs/UX-01R-CLOSURE.md`.
