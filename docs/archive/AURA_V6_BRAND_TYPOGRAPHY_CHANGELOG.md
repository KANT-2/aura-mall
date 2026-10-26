# AURA V6 — Korean editorial titles & custom wordmark

> 보관 기록입니다. 구현·경로·명령·검증 결과는 작성 당시 기준입니다. 현재 개발 방법은 [문서 목록](../README.md)에서 확인하세요.

## Change summary
- Header and footer wordmark: new outlined serif glyph vectors, not a sans text label.
- Custom icon and favicon from the same letterform.
- Large Korean editorial titles use Noto Serif KR with robust system serif fallbacks.
- English display headings use Cormorant Garamond with fallback.
- Body, buttons, filters, chips and product metadata remain accessible sans-serif.
- Gift-set image heading and Atelier finished-bottle label also reuse the outlined brand wordmark.
- UI/functional flow from V5, existing images, assets, coupons and routes are preserved.

## Files changed
- `components/editorial/AuraWordmark.tsx` — vector logo component (new)
- `components/editorial/Shell.tsx` — use logo in global header/footer
- `components/editorial/Shared.tsx` — gift set product mark
- `components/editorial/Atelier.tsx` — completed perfume label mark
- `app/layout.tsx` — latest brand stylesheet and hosted title font link
- `app/aura-brand-v6.css` — all title and logo styles (new)
- `app/editorial.css` — removing binary font hard-dependency
- `app/icon.svg`, `app/favicon.ico`, `public/assets/brand/aura-wordmark.svg`

## Operational limitations
- External Google Fonts stylesheet needs internet access in user's browser to load Cormorant Garamond and Noto Serif KR. Korean/Latin local system serif fallback works without access.
- Font binary files have intentionally not been redistributed. `APPLY_TO_LOCAL.py` keeps any font files already present in your current local checkout. Browser loads Pretendard using its public stylesheet when online and falls back to installed system Korean sans when offline.
- Next.js dependency installation and full browser flow validation must be done in local environment.
- Brand name baked into original product photos remains untouched; changing it would require new product photography.

## Local verification
```
cd C:\dev\aura-mall
npm ci
npm run build
npm run dev
```
Check desktop and mobile header/footer, home / shop / atelier / product detail / mypage, V5 mixing and label selection.
