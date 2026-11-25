# MoneyTreeVentures design direction — UX-00 proposal

This document proposes design choices; it does not change the product. Current facts are from `src/app/globals.css`, `src/components/layout/*`, `src/components/home/*` and the 390px/1440px screenshots in `docs/ux-audit/`.

## Existing identity (verified)

Light tokens: background `#f4f7fb`, surface `#ffffff`, text/navy `#0f1e36`, orange accent `#f97316`, border `#dce4ee`; dark equivalents include background `#0b1423`, surface `#111e31`, text `#f1f5f9`, accent `#fb923c`. Font stack prefers Geist, then Inter/system. Current card radius is `1.25rem`; button radius token is `0.75rem`, though many CTAs use full pills. The homepage uses editorial type, grid lines, paper/card mockups, small uppercase labels and restrained orange CTAs. CSS focus outline is orange; global reduced-motion CSS exists. Desktop 1440px captures support this description. No logo or brand change is proposed.

## Three owner-review concepts

1. **Refined editorial commerce — recommended primary.** Preserve navy/orange, paper-like hero and clear product cards. Improve hierarchy, spacing, media framing and catalogue discovery. It fits the existing implementation and prioritizes the 80% commercial requirement. The corrected 390px captures show no horizontal overflow in the sampled routes.
2. **Interactive Learning Studio — selected creative layer.** Use one elegant branching learning ecosystem illustration in the hero, with nodes representing Guides, Starter Kits, Bundles and Call Guidance. A branch can respond gently to focus/hover and link to a genuine category only when the corresponding product exists. Motion for React may animate a small line/node reveal; all content must be visible with reduced motion and before hydration. This is the 20% creative experience, not a site-wide effect.
3. **Minimal premium product gallery.** Give media and product typography more space, reduce decoration, use neutral surfaces and precise details. Appropriate for catalogue/detail, but as the whole-site direction it risks losing the current editorial character.

**Hero specification (proposal, not implemented):** left column retains the headline, descriptive copy and two clear CTAs. Right column becomes an accessible static SVG/CSS branching diagram rooted in “Start learning”, with four labeled leaf cards, brief product-type descriptions and a quiet orange path. On desktop, focused leaf cards reveal supporting copy; on mobile the diagram stacks into a simple sequence. Static fallback is the same labeled branches without motion or hover dependence. Do not show fabricated product counts, prices or endorsement claims. Decorative branches should be `aria-hidden`; actionable cards must be actual links with visible focus. The current layered paper composition can inform its material treatment.

## Proposed token refinement (requires approval)

| Area | Recommendation |
|---|---|
| Color | Retain current navy/orange and semantic light/dark variables. Add explicit muted, warning, danger and focus tokens; check WCAG contrast in both themes before changing values. |
| Type | Keep Geist/system stack. Use a 16px body baseline, 1.5–1.7 body line-height, responsive display roughly 44–88px, page titles 32–56px, section titles 24–40px. Avoid tiny 9–11px critical labels. |
| Spacing | Use 4/8/12/16/24/32/48/64px steps; preserve wide editorial whitespace without forcing mobile horizontal scroll. |
| Surfaces | Three levels: background, primary surface, subtle secondary surface. Keep border contrast sufficient in dark mode. |
| Shadows/radii | One soft card shadow, one raised hover shadow; cards 16–20px, fields 10–12px, principal CTAs pill-shaped. Avoid multiple competing effects. |
| Grid | 1 column below 640px, 2 at 640–1023px, 3 or 4 at 1024px+ only where content fits. Containers remain capped near current 1360px. Test 320/360/390/430/768/1024/1280/1440/1920. |
| Buttons/inputs | Minimum 44px target, explicit disabled/busy states, consistent labels and focus rings. Fields need persistent labels and error text, not placeholders alone. |
| Cards/skeletons | Reserve media aspect ratio and final text space. Skeletons mirror final layout, announce loading once, and avoid fake prices or success states. |
| Toast/status | Use inline `role=status` for low urgency and `role=alert` for blocking errors; never auto-dismiss payment outcomes. |
| Motion | CSS hover/focus 120–200ms; editorial entrance 300–550ms max with existing Motion. Prefer ease-out `[0.22,1,0.36,1]`; use low-distance spring only on decorative cards after testing. No parallax on mobile. |
| Overlays | Establish documented layers for sticky header, menu, dialog and toast; keep focus inside modal dialogs and restore it on close. |

## Approval needed before UX-01

Approve refined editorial commerce as the base, decide whether to prototype the Learning Studio hero, and confirm whether product imagery will be owner-supplied. UX-01 should extend the verified 390px baseline to 320/360/430 and tablet widths, then establish light/dark/keyboard baselines. Do not promise a new animation library or a finished legal policy as part of visual work.

## 25 November 2026 decision and implementation note

The owner approved **Refined Editorial Commerce** for UX-01. The implemented token and public-screen foundation, screenshots and limitations are recorded in `docs/UX-01-DESIGN-SYSTEM.md`. The Interactive Learning Studio hero remains a concept requiring a separate decision; it was not implemented.
