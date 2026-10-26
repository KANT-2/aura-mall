# AURA 데이터베이스 SQL

테이블 설계 기준은 [ERD](../../../docs/backend/ERD.md)입니다.

| 파일               | 내용                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| `schema.sql`       | 테이블 21개(ERD 18개 + 관리자 계정·재고 조정·감사 기록), 제약 조건, 인덱스 |
| `seed.sql`         | 컬렉션·상품 유형·상품 30·향료 24·향 계열·추천 이름·홈 배너 초기 데이터     |
| `generate_seed.py` | 웹 Mock의 `catalog.json`으로 `seed.sql`을 다시 만드는 스크립트             |

## 적용

빈 PostgreSQL(13 이상) 데이터베이스에 순서대로 실행합니다. 장바구니는 브라우저에 저장하므로 테이블이 없습니다.

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/db/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/db/seed.sql
```

`seed.sql`은 여러 번 실행해도 기존 행을 유지합니다. 계정은 만들지 않습니다.

## 관리자 계정

관리자는 고객(`users`)과 분리된 `admins` 테이블에 저장하고, 로그인·회원가입 API도 고객과 따로 씁니다. 공개 회원가입은 없고 로그인한 관리자가 새 관리자를 등록합니다. **첫 관리자**만 기본 비밀번호 없이 운영 절차로 만듭니다. 비밀번호 해시는 API의 해시 방식으로 만든 값을 넣습니다(API 구현 시 생성 명령 제공 예정).

```sql
INSERT INTO admins (email, name, password_hash) VALUES ('관리자 이메일', '이름', '<해시값>');
```

## 상품 데이터 갱신

웹의 `apps/web/mock-server/fixtures/catalog.json`을 고친 뒤 저장소 루트에서 실행합니다.

```sh
python apps/api/db/generate_seed.py
```

마이그레이션 도구(Alembic) 도입 시 `schema.sql`을 첫 마이그레이션의 기준으로 사용합니다.
