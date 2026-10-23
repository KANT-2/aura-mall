# AURA V4 — Reference UI integration and interaction QA

2026-10-13 · Based on the two user-approved AURA UI & 2D asset sheets.

## Applied to actual product UI (not pasted image sheets)

| Reference section | Implementation | Where |
|---|---|---|
| Mixing vessel states (0 / 1 / 5 / 10 / 20 / mixing) | Layered SVG glass vessel with changing fill and dynamic amber swirl; existing 6 standalone SVG assets remain in `/assets/editorial` | `components/ui/Vessel.tsx`, Atelier selection and blend |
| Ingredient cards TOP / HEART / BASE | Different warm material tones, label, botanical illustration, short description, circular plus/count button | `Atelier.tsx`, `aura-sheet-ui-v4.css` |
| Selection states | Default, hover, pressed/selected, disabled and keyboard focus | Ingredient buttons with `aria-pressed` and CSS |
| Ingredient token chips | Rounded, tinted portrait tokens; stage, amount, percent, colored fraction and working ± / remove buttons | Atelier sidebar, recipe drawer, result details |
| Drag & drop assets | Drag card to live vessel on desktop, with highlighted target; click/tap fallback works for touch | `Atelier.tsx` `onDragStart` / `onDrop` |
| Droplets, ripple, swirl, motion | SVG vessel + drop and impact states + animated liquid swirl; not a forced arrow-orbit illustration | Vessel and blending overlay |
| Ratio/progress | 0–20 segmented progress and separate TOP/HEART/BASE portion bars | Atelier central panel |
| Counter / badges | Note count, drop count, balance/character badge | Atelier center |
| CTA / utility icons | Functional selection, reset, info, blend, save, copy, plus/minus controls | Atelier / result |
| Floating ingredient badges | Live botanical artwork and ingredient names, selected notes only | Blending completion and result |
| Bottles, label, tags | SVG bottle & editable label layer, staggered arrival and label choice | Atelier result and My AURA |
| Tools & vessels | Existing real SVG editorial files for tools and bottles preserved; only meaningful assets appear in the product UI | `/public/assets/editorial/` |

## Blender behavior — important

The central glass vessel is now the direct manipulation target. Open the blend dialog after choosing at least one ingredient. Drag your finger/mouse in a circular gesture **on the actual beaker**, watching the real percentage and liquid response. Or use the accessible **버튼으로 섞기** action for a single automated sequence. Keyboard users can focus the vessel and use arrow keys / Enter / Space to advance. Reaching 100% shows floating ingredient badges and the action to label the result. The user is not required to tap a +10% button repeatedly, make a specific number of rotations, shake a phone, or view perfume spraying.

## Asset policy

- UI controls are React and CSS, never rasterized UI screenshots.
- Transparent botanical illustrations: 24 WebP files in `/assets/botanical/`; preserved from the prior version.
- Lab glassware, bottle silhouettes, label, droplet, paper tag and tools: separate SVG files in `/assets/editorial/`; 59 assets.
- `/assets/reference/` is non-rendered reference material and is intentionally retained for comparison, not used in the current app mapping.
- The supplied sheets are visual references. Any botanical objects not individually supplied at native resolution are reinterpreted with the existing series; this release does **not** claim that it reconstructs those pixels exactly from the collage.

## Validation performed

- TypeScript 32 source files: transpile/syntax validation PASS.
- V4 stylesheet: PostCSS parser PASS.
- Botanicals: 24 sources exist.
- Editorial SVGs: 59 sources exist.
- Next.js runtime build: **NOT verified**. Package cache is incomplete in this execution environment (`npm ci --offline` reports ENOTCACHED).
- Browser screenshot automation: **NOT verified**. Chromium did not complete in this environment.
- Real device interaction and layout behavior: must be tested locally. Do not treat static checks as a complete UX acceptance test.

## Local acceptance checklist

1. 1440 / 1024 / 768 / 390 / 320px: open `/atelier`, check each stage tab and card sizing without horizontal scroll.
2. Tap a note: count increases, droplet plays, ingredient token appears. Test ± and remove.
3. Desktop: drag a card to the **center beaker**; count must increase once per drop.
4. Tap `이 조합으로 향 섞기`, move finger/mouse **on the beaker**. Fluid should visibly stir and the progress indicator should rise.
5. Test `버튼으로 섞기`; verify 100% completion with one click and no repeated tapping.
6. Finish and name fragrance: label shows on front of SVG bottle; changing name/style updates it.
7. Save if logged in and verify in My AURA; without login the login CTA must remain functional.
8. Test reduced-motion settings and keyboard navigation; no action should be gesture-only.
9. Run `npm ci`, `npm run build`, `npm run dev` on local Windows environment.

## Implementation files

- `components/editorial/Atelier.tsx`
- `components/ui/Vessel.tsx`
- `app/aura-sheet-ui-v4.css` (imported LAST)
- `app/layout.tsx`
- Existing 24 botanical WebP and 59 editorial vector files
