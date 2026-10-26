# AURA V5 — Atelier Mixing & Result UX Repair

> 보관 기록입니다. 구현·경로·명령·검증 결과는 작성 당시 기준입니다. 현재 개발 방법은 [문서 목록](../README.md)에서 확인하세요.

Date: 2026-10-13. Base: AURA V4, all app pages and assets preserved.

## Fixed in source

| Problem (reported screenshot) | Source change | Verification target |
|---|---|---|
| One click ends mixing almost instantly | Manual circle-drag remains primary; 3 full circles ~= 100%; alternate auto mode increments 1% / 85 ms (about 8.5 seconds). Removed instant skip. | Three deliberate circles required, modal stays open while mixing |
| Touch/mobile unknown | `touch-action:none`, pointer capture and continuous Pointer Events on beaker; keyboard alternative and optional timed auto mode | Test real iOS Safari/Android Chrome with finger gesture |
| Rosemary and other notes disappearing in result | Result illustration now generated from full `selected` list, not `.slice(0,3)`. Complete recipe remains in note pyramid/details. | Include rosemary among six selected; ensure visible illustration & textual recipe |
| Result whitespace, clipped heading | New scoped V5 responsive composition: compact image gallery plus bottle; two columns desktop; stacked mobile; heading auto-wrap | 320, 375, 390, 768, 1024, 1440px |
| Share icon silently copies | Explicit **레시피 복사** button; native **공유하기** offered only when `navigator.share` exists | Click copy => clipboard; share => native share sheet where supported |
| Label radio changes hardly visible | Visually distinct Classic framed/serif, Paper warm textured-look/stamp, Minimal open sans. Actual bottle overlay updates instantly. | Click each radio and compare bottle typography/background/border |
| Lost name recommendations | Deterministic 5 suggested names by note profile + dominant note; pressing chip populates name input and preview label | Choose any suggestion; save state updates |
| Modal closes/route looks cut off | Upon result transition return document scroll to top; tighten responsive typography and spacing | Check no horizontal overflow, nav/footer visibility |

## QA performed
- Parsed all 31 TSX/TS source files with installed TypeScript transpiler: no syntax diagnostic.
- Parsed all 6 CSS stylesheets with tinycss2: no stylesheet parse errors.
- `public/assets/botanical/rosemary.webp` exists, 420x420 RGBA. All 24 botanical assets are retained.
- Asset folders, product images, routing, global menus and checkout are preserved from V4.

## Not yet verified
- `npm run build` and live Next.js browser testing could not complete because dependency installation in this environment could not finish.
- Mobile browser pointer capture, gesture sampling and native Web Share need real-device verification.
- This is a functional source update, not a claim of pixel-perfect match to image-generation design sheets.

## Quick QA script (manual)
1. Run `npm ci && npm run dev`; open `/atelier`.
2. Select lemon, mandarin, grapefruit, rosemary, peppermint, vetiver (or any six notes).
3. Open "이 조합으로 향 섞기", drag in three circles; check it does not complete after one click and count progresses.
4. Reset via closing modal and re-open; choose auto mixing; check it needs roughly 8–9 seconds, with visible progress.
5. Open completed result; verify rosemary appears, note pyramid shows all notes.
6. Test 3 label radios; choose a suggested name and confirm text changes on physical label preview.
7. Use "레시피 복사" and verify copied text; on supported mobile use "공유하기" and confirm native share sheet.
8. At 320/390/768/1440px check no clipped heading, note icons or buttons.

## To apply
Extract ZIP outside `C:\dev\aura-mall`, open PowerShell in extracted `aura-mall`, then:

```powershell
python .\APPLY_TO_LOCAL.py --target "C:\dev\aura-mall" --apply
cd C:\dev\aura-mall
npm ci
npm run build
npm run dev
```

The script backs up and replaces managed source folders while preserving `.git` and local environment files. Confirm local unsaved changes before applying.
