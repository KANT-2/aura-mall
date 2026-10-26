# 웹 글꼴

현재 글꼴 연결은 [루트 레이아웃](../../src/app/layout.tsx)에서 관리합니다.

- Cormorant Garamond·Noto Serif KR: `next/font/google`로 빌드 시 준비합니다. 빌드 환경에서 Google Fonts에 접근할 수 있어야 합니다.
- Pretendard: 브라우저에서 jsDelivr 스타일시트를 불러옵니다.
- CSS에는 네트워크·글꼴 로딩 상황에 대비한 시스템 글꼴 대체 설정이 있습니다.

이 디렉터리는 별도 글꼴 바이너리를 배포하지 않습니다. 상세 자산 안내는 [에셋 문서](../../../../docs/assets/README.md)에 있습니다.
