# UX-02A — Authenticated UI acceptance

**Status: PARTIAL — authenticated browser acceptance pending.** 25 November 2026, branch `staging`. The local owner-managed development server was reused at `http://localhost:3000`; Codex did not start, restart or stop it. No Google sign-in, session export, PDF download, product edit, payment or email was performed by this run.

## Authentication readiness

The local configuration loader reports `APP_URL` and `BETTER_AUTH_URL` matching `http://localhost:3000`, `MONGODB_DB_NAME` matching `moneytreeventures`, and presence of the MongoDB, Better Auth and Google configuration keys. No values or secrets were printed. The login route responded HTTP 200; anonymous `/api/admin/products` and `/api/purchases` each returned HTTP 401.

Better Auth uses Google-only sign-in, same-origin trusted origin/callback behavior, HTTP-only same-site local cookies and its own `authUsers`, `authSessions` and `authAccounts` collections. Admin authorization requires an active admin application profile linked to the verified owner Google identity; a supplied email or browser-side role is insufficient. Customer pages require an active customer profile. These source findings and mocked policy tests are not a live signed-in session check.

The owner authorized manual Google sign-in in a new isolated browser. The authenticated harness passed its anonymous API checks and reached the sign-in prompt. Its Chrome process was not visible on the owner's desktop in that run, so sign-in could not proceed; the run was canceled and the temporary profile cleaned up. This is a browser/terminal visibility limitation, not evidence of an application authentication failure. The harness cannot reuse cookies from the owner's ordinary browser and must not forge them. No protected page, admin editor or customer record was observed in a signed-in browser.

## Acceptance matrix

| Area | Actual evidence | Result / remaining action |
|---|---|---|
| `/admin`, navigation and product listing | Source inspected; anonymous API 401; mocked owner-policy tests 19/19; component fixtures 8/8 include admin listing/navigation | **AUTHENTICATED NOT_VERIFIED.** Owner must sign in with the existing approved owner identity in an authorized local test session. |
| Admin product editor overlay | Shared controller's isolated Chromium test covers background inertness, focus containment, nested Escape, focus return and scroll restoration; no product save or upload | **AUTHENTICATED NOT_VERIFIED.** Open `+ Add product` in a genuine owner session, tab through controls, attempt background focus, press Escape and confirm focus/scroll restoration at 320/390/768/1440px. |
| `/account`, `/account/library`, `/account/orders`, `/account/bookings` | Source inspected; anonymous purchases API 401; no customer session used | **AUTHENTICATED NOT_VERIFIED.** Use an approved active customer profile; inspect account navigation, real empty/loading states and existing purchases/bookings without changing records. |
| Purchased PDF controls | Source shows buttons only for existing purchase files; controls were enlarged to 44px minimum | **VISIBILITY NOT_VERIFIED** with a real entitlement. Do not click the download button in this acceptance run. |
| Mobile/desktop, light/dark, keyboard, reduced motion, contrast, hydration | Anonymous public-route Chrome checks passed 2/2; isolated overlay fixture passed; source-backed touch-target regression passed | **PROTECTED ROUTES NOT_VERIFIED** at 320/390/768/1440px or in either theme. No signed-in console or screen-reader result was collected. |
| Screenshots | UX-00/01/02 retain anonymous public and isolated skeleton screenshots | **No authenticated screenshots captured.** Do not put unredacted account/order/customer screenshots in Git. |

## Confirmed UI correction

The admin mobile navigation toggle and links declared 40px targets; admin product actions declared 36px targets. Customer PDF download, booking request and order-history actions declared 40px targets. Their classes now reserve at least 44px. The admin's nine-link desktop navigation now switches to the compact menu below `xl`, and mobile sign-out appears inside that menu so the 320px header has room. No click handler, role, authorization or data flow changed. A source-backed regression checks the classes; an authenticated rendered-size check remains pending.

## Checks performed

- `npm.cmd run test:admin`: **19/19 passed**, policy and route tests with mocks; no live Google session.
- `npm.cmd run test:browser`: **8/8 passed**, local component/HTML fixtures.
- `node --test tests/ux/authenticated-touch-targets.test.mjs tests/ux/interaction-foundation.test.mjs`: **6/6 passed**, including isolated Chromium overlay behavior.
- `node --test tests/ux/design-foundation.browser.test.mjs`: **2/2 passed** against the running local server; these are anonymous public routes.
- Authenticated harness startup: **PARTIAL**. Anonymous API denial passed and the manual sign-in prompt was reached; the browser was not visible on the owner's desktop, so the run was canceled before authentication. No signed-in assertion or screenshot passed.
- Application and test TypeScript: **passed**. Focused ESLint: **passed**. Anonymous protected API status checks: **401/401**.
- Production build: **NOT_RUN** for UX-02A because the owner-managed development server must remain untouched and the normal build shares Next's output directory. UX-02's previous 55/55-page build does not verify this later touch-target edit.
- `git diff --check`: **passed** after the final documentation edit; Git emitted line-ending notices only.

## Exact owner-run acceptance procedure

1. Keep the existing local server running. Use the approved development Google account. The owner has already authorized manual sign-in for this acceptance; a fresh sign-in can create/refresh Better Auth session records and possibly a customer profile. Do not paste cookies, credentials or OAuth callback URLs into chat.
2. In an **interactive PowerShell window on the owner's desktop**, run the gated harness with the approved owner Google identity:

   ```powershell
   $env:E2E_BASE_URL = 'http://localhost:3000'
   $env:E2E_AUTHORIZED_TEST = 'true'
   $env:E2E_AUTH_MODE = 'admin'
   $env:E2E_UX_ACCEPTANCE = 'true'
   node tests/e2e/authenticated-local.mjs
   ```

   Complete Google sign-in in the opened browser, press Enter in the terminal, review the route/viewport/theme/editor results, sign out in that browser and press Enter again. The harness asserts 320/390/768/1440px layout and overlay behavior. If the window is not visible, cancel the run; do not press Enter as though sign-in succeeded. It does not replace visual judgment, contrast measurements or a screen reader.
3. Repeat with `E2E_AUTH_MODE = 'customer'` and an approved active customer Google identity. The owner admin profile alone does not satisfy the customer-role gate.
4. Visually inspect protected pages in both themes, including contrast, touch targets, tab order, loading/empty/error states and the editor's focus behavior. The harness can save 390/1440px header crops if `E2E_UX_CAPTURE_SAFE=true`, but review/redact them before sharing or adding them to Git; account and order content can be private. Do not click PDF download controls. Full screen-reader verification remains separate.

UX-03 can be planned separately, but **UX-02A authenticated acceptance cannot be marked complete** until the owner/customer session checks and protected-route visual matrix are actually observed. No production readiness is implied.
