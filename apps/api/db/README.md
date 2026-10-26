# AURA 데이터베이스 SQL

테이블 설계 기준은 [ERD](../../../docs/backend/ERD.md)입니다.

| 파일               | 내용                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `schema.sql`       | 테이블 20개(ERD 18개 + 관리자 재고 조정·감사 기록), 제약 조건, 인덱스  |
| `seed.sql`         | 컬렉션·상품 유형·상품 30·향료 24·향 계열·추천 이름·홈 배너 초기 데이터 |
| `generate_seed.py` | 웹 Mock의 `catalog.json`으로 `seed.sql`을 다시 만드는 스크립트         |

## 적용

빈 PostgreSQL(13 이상) 데이터베이스에 순서대로 실행합니다. 장바구니는 브라우저에 저장하므로 테이블이 없습니다.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/db/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/db/seed.sql
```

`seed.sql`은 여러 번 실행해도 기존 행을 유지합니다. 계정은 만들지 않습니다. 관리자는 기본 비밀번호 없이 운영 절차로 지정합니다.

```sql
UPDATE users SET role = 'admin' WHERE lower(email) = lower('관리자 이메일');
```

## 상품 데이터 갱신

웹의 `apps/web/mock-server/fixtures/catalog.json`을 고친 뒤 저장소 루트에서 실행합니다.

```sh
python apps/api/db/generate_seed.py
```

마이그레이션 도구(Alembic) 도입 시 `schema.sql`을 첫 마이그레이션의 기준으로 사용합니다.
