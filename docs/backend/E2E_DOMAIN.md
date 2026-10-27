# 개인 E2E — 도메인·업무 API (심우섭)

> 코드: [`apps/api/tests/db/test_e2e_journey.py`](../../apps/api/tests/db/test_e2e_journey.py) · Linear CRA-5 하위

## 무엇을 확인하나

회원 한 명과 관리자 한 명이 **실제 PostgreSQL**에서 백엔드 전체를 지나간다. API → 서비스 → 도메인 규칙 → DB → API를 거치며, 운영과 같은 JWT 로그인(#42)·토큰 폐기 저장소·관리자 로그인(#50)을 쓴다. 저장소나 의존성을 가짜로 바꾸지 않는다.

| 단계 | 요청                                                               | 확인하는 것                                                                   |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1    | `GET /catalog`                                                     | 상품 가격이 DB 시드와 같다                                                    |
| 2    | `POST /auth/login`                                                 | 회원 로그인 (argon2id, Access Token)                                          |
| 3    | `POST /recipes` → `GET /recipes`                                   | 레시피 저장·조회, 색은 서버 계산                                              |
| 4    | `POST /orders`                                                     | 상품 + 저장한 조합 주문, 클라이언트 가격 무시, 배송비 쿠폰                    |
| 5    | `GET /orders`                                                      | 주문 내역에 방금 주문                                                         |
| 6    | `python -m aura_api.infra.create_admin` → `POST /admin/auth/login` | 첫 관리자 생성·로그인                                                         |
| 7    | `GET /admin/orders`, `/admin/orders/{id}`, `/admin/overview`       | 주문자·주문 당시 구성(맞춤 조향 라벨)·현황                                    |
| 8    | DB 조회                                                            | 재고 1개 감소, 쿠폰 `USED` + 주문 ID 연결                                     |
| 9    | 교차·로그아웃                                                      | 회원 토큰 → 관리자 API 403, 관리자 토큰 → 회원 API 401, 로그아웃 후 둘 다 401 |

## 실행

```sh
docker run -d --rm --name aura-dev-test -e POSTGRES_PASSWORD=aura -e POSTGRES_DB=aura_test -p 127.0.0.1:55439:5432 postgres:16-alpine
AURA_TEST_DATABASE_URL=postgresql+asyncpg://postgres:aura@127.0.0.1:55439/aura_test \
  uv run --directory apps/api --locked pytest tests/db/test_e2e_journey.py
```

테스트 DB의 모든 테이블을 지우고 다시 만든다. 지워도 되는 DB에서만 실행한다.

## 화면 E2E와의 관계

지금 웹 주문 화면의 결제 버튼은 비활성이고, BFF가 #42 로그인 응답(JSON 토큰)을 쿠키로 바꾸는 연결은 진행 전이다. 그래서 이 E2E는 BFF 뒤의 API 전 구간을 검증한다. BFF 로그인·관리자 쿠키 연결이 끝나면 같은 흐름을 Playwright 화면 E2E로 옮길 수 있다.
