# Phase 8 — English-Default Multilingual Website

Date: 2026-11-21  
Status: `PARTIALLY_VERIFIED` — local implementation only; no Phase 9 work started.

## Implemented

- English is the default. Supported locales are English (`en`), Hindi/Devanagari (`hi`), Roman Hinglish (`hi-Latn`), and Tamil (`ta`). A native accessible selector persists the choice in a same-origin `HttpOnly`, `SameSite=Lax` cookie. Unsupported values are rejected.
- Locale changes preserve the current URL and query parameters, cart state, and existing authentication/payment routes. The client updates `document.documentElement.lang`, refreshes server-rendered content, and continues to support existing light/dark/system themes.
- Core navigation, homepage section copy, catalogue controls, product-detail UI, login, cart, checkout, account history, About, Contact, FAQs, and footer copy use locale dictionaries. Locale-aware INR formatting converts integer paise without changing stored prices.
- Product-authored names, descriptions, features, FAQs, category names, and SEO fields remain unchanged. Legal policy source wording remains unchanged and displays a source-language/owner-review notice. No machine-translated product or legal copy is presented as owner-approved.
- Local system font stacks support Devanagari and Tamil without remote font dependencies. Authentication, authorization, payment, database, seed, storage, and deployment behavior was not changed.

## Rendering and SEO decision

The application uses Next.js Cache Components/PPR. Reading the locale cookie at the root document made the root render depend on request-time data and failed the production build. Locale selection therefore lives in a server component beneath `Suspense`; the root document remains statically prerenderable with `lang="en"`. For a non-English preference, the translated server subtree is selected from the cookie and the client synchronizes document `lang` after hydration. The initial raw `<html lang>` is English until hydration. URLs and canonical metadata remain locale-neutral; no `hreflang` alternates are emitted because there are no distinct locale URLs. Product SEO metadata remains owner-authored.

## Translation coverage and limits

English is the complete source dictionary. Hindi, Hinglish, and Tamil translate core UI strings; missing dictionary keys deliberately fall back to English. Automated key checks cover critical navigation/catalogue/cart/checkout/account labels, not every string on every route. Existing illustrative homepage artwork/copy and product-authored content are not comprehensively localized. Owner/native-speaker review is still required before translations are final.

## Verification

- `npm run test:i18n`: passed, 4 tests (locale allowlist/fallback, required core-key coverage, interpolation, INR formatting).
- `npm run test:browser`: passed, 4 Chromium component fixtures; these are not a full Phase 8 route matrix.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with no findings.
- `npm run build`: passed with process-only reserved media URL and dummy localhost MongoDB settings. The build logged two sanitized `admin.api.request_failed` events because the dummy database is unavailable; no database integration was verified. `.env.local` was not changed.
- `npm run test:smoke`: passed. It checked production page responses, rejected an unsupported locale, verified the Hindi locale cookie's HttpOnly/SameSite/Path attributes, confirmed Hindi server-rendered navigation, and checked existing robots/sitemap/webhook behavior.
- Responsive checks at 390/768/1440, keyboard/theme interactions across localized routes, client-side selector interaction, authenticated journeys, external services, and human translation review: not run.

## Remaining work

- Complete translated-key coverage for every customer-facing message and obtain owner/native-speaker translation review.
- Run a browser matrix across required routes at mobile/tablet/desktop widths, with keyboard navigation, reduced motion, light/dark/system themes, and persisted locale selection.
- Consider URL-based locales only if distinct locale SEO URLs become a requirement; that requires separate route-architecture review.
- Phase 7 owner-authenticated persistence, database index/search, and responsive/theme checks remain pending as documented in [Phase 7](PHASE-07-CATALOGUE-SEARCH.md).
- Project is not launch-ready. No Phase 9 work was started.
