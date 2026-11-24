# Phase 3 - Runtime and Admin Stabilization

Checkpoint: 2026-11-21. This report records local source changes and test results; it does not assert production readiness or confirm a signed-in owner session.

## Findings and changes

- The captured Next development log showed a hydration mismatch caused by the `cz-shortcut-listen` attribute injected on `<body>` by a browser extension. The theme toggle also depended on `next-themes` state during its first render, so it now uses a hydration-safe mounted snapshot and renders a stable icon before hydration.
- Added Next.js 16's `data-scroll-behavior="smooth"` root attribute to pair the existing CSS smooth-scroll behavior with the framework's supported scroll restoration behavior. Existing reduced-motion rules remain.
- Replaced application-owned Mongoose 9 `findOneAndUpdate` options using deprecated `new: true` with `returnDocument: "after"` in customer profile, email outbox, download rate limit, and refund operations.
- The development log did not contain a current `admin.api.request_failed` event or instant-navigation warning. The older build-time admin error entries do not expose enough detail to attribute a cause. No `instant=false` opt-out was added.
- The admin landing page was static. It now displays aggregate database counts for products by lifecycle, categories, orders, customers, and unscheduled bookings. It does not return customer/order records or display invented values.
- Added a responsive, keyboard-operable admin navigation with active page indication and a Categories entry. Navigation only links to existing management pages; Orders and Customers appear as read-only counts because their management screens do not exist.
- Added the admin Categories page and protected collection GET API. Existing category create/update/status services and authorization are reused. Deactivation/archive policy remains owned by the service; no delete operation was introduced.

## Phase 3.1 - Admin product-list resilience (2026-11-21)

The runtime failure is consistent with an item reaching the UI without a usable `name`; the crash occurred because the component called `.slice()` directly on that value. Source tracing found no `title`/`name` mapping defect, excluded-field projection, or admin response serializer: the Product schema and create/update validation use canonical `name`; `listProducts()` returns lean documents without a projection; and the admin GET route forwards that result unchanged. Mongoose validation protects normal writes, but raw imports or legacy records can bypass it.

The exact stored record was not inspected in this phase. Therefore, an existing incomplete DB record and a legacy record containing only `title` are not independently confirmed. No migration or database correction was performed. The component now treats `name` as canonical, temporarily displays legacy `title` only as a flagged recovery hint, and warns that the canonical field must be repaired. No schema/API duplicate `title` field was added.

The admin list now normalizes untrusted rows and pagination at the UI boundary, guards optional arrays and asset fields, uses safe fallbacks for absent/empty names, slugs, thumbnails, invalid types/statuses/prices, and marks invalid rows. Rows with missing IDs cannot be edited; invalid records cannot change lifecycle status; records with a valid ID can still be opened to repair name/slug. Missing thumbnails show a placeholder and warning. The existing API error path remains visible through the page alert.

Regression coverage passes for valid, empty, no-thumbnail, missing/empty-name, legacy-title, missing-slug, optional-field, null-row, multiple-row, and service-error cases. A Chromium test rendered the AdminProducts component fixtures and verified malformed rows do not hide valid rows; a separate route-handler test covers service errors. The browser test did not access the authenticated `/admin/products` route or a real database. See the Phase 3.1 rows in [the test register](../TEST-REGISTER.md).

The focused catalogue suite passed (65/65), the admin product component browser fixture passed (1/1), `npx.cmd tsc --noEmit` passed, ESLint passed, and the production build completed. The build still emitted two sanitized admin API errors during prerender; these are tracked separately and were not caused or resolved by this product-list fix.

## Authorization and owner access

The existing `AdminGate` and server-side `requireAdmin` policy were preserved. The dashboard calls `requireAdmin` before loading its aggregate data. Local route-handler tests verify an unauthenticated request is rejected before service invocation. This does not establish the real owner browser session.

The owner reports that the role was corrected and `/admin` now opens. This is owner-reported only: this execution had no authenticated owner browser context, and the prior fresh-process Atlas SRV lookup timed out. No account diagnostic, role change, bootstrap, or database write was performed in this phase.

## Verification

See [test register](../TEST-REGISTER.md) for exact commands and results. The local full test suite passed after the dashboard/category tests were added (241 passed, 1 skipped, plus 2 scheduled-handler tests). TypeScript and ESLint passed. The production build, production smoke, limited client-bundle scan, and existing browser media test also passed. Two sanitized `admin.api.request_failed` events were emitted during build prerender and remain unexplained.

## Deferred gaps

- End-to-end admin UI verification against a disposable database and authenticated owner browser remains outstanding.
- Order, customer, and coupon management screens are not present and are intentionally not linked as working admin tools.
- The extension-induced body attribute requires disabling the responsible browser extension to confirm a clean browser DOM. It is not an application-generated mismatch in the captured log.
- Current exact cause of historical prerender `admin.api.request_failed` events remains unknown; current dev log did not reproduce them.
