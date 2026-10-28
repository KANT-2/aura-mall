"""Add ordinary member, recipe, inquiry and unpaid/cancelled order records.

Run --execute with AURA_RECORDS_PASSWORD in the environment. Existing rows and passwords
are preserved. Order creation and cancellation use the same services as customer requests.
"""

import argparse
import asyncio
import json
import os
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert

from aura_api.config import Settings
from aura_api.domain.atelier import mix_color
from aura_api.domain.catalog import Ingredient as RuleIngredient
from aura_api.identity.service import PASSWORD_HASHER
from aura_api.infra.database import create_engine, create_sessionmaker
from aura_api.infra.models import (
    Admin,
    AdminAuditLog,
    Ingredient,
    PartnerInquiry,
    Product,
    ProductQuestion,
    Recipe,
    RecipeIngredient,
    User,
    UserCoupon,
)

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://aura.example.invalid/catalog-records/v1")
MEMBER_EMAIL = "haneul.kim@example.com"
SCENTS = (
    "비 오는 정원",
    "새벽의 숲",
    "햇살 머문 오후",
    "조용한 도서관",
    "포근한 린넨",
    "바다의 잔향",
)
QUESTIONS = (
    (
        "향의 느낌이 궁금해요",
        "처음 사용할 때 어떤 분위기의 향인지 알고 싶어요.",
        "상품의 향 이야기와 노트 구성을 먼저 확인해 주세요. 취향에 맞춰 선택하실 수 있어요.",
    ),
    (
        "선물용으로 준비하고 있어요",
        "선물할 때 함께 참고할 제품 정보를 알려주세요.",
        "상품명·용량·유형을 확인해 주세요. "
        "Gift Set은 상세 화면에서 세 가지 제품을 직접 선택하실 수 있어요.",
    ),
    (
        "배송 전 확인하고 싶어요",
        "주문 정보와 배송 요청사항은 어디에 남기면 되나요?",
        "주문 화면에서 받는 분·연락처·주소·배송 요청사항을 입력하실 수 있어요.",
    ),
    (
        "함께 쓰기 좋은 제품을 찾고 있어요",
        "같은 컬렉션에서 다른 유형의 제품도 보고 싶어요.",
        "컬렉션 목록에서 같은 향의 제품 유형을 비교해 주세요. "
        "제품별 상세 안내를 함께 확인하시면 좋아요.",
    ),
)


def record_id(kind: str, number: int) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{kind}:{number}")


async def seed(database_url: str, password: str, *, execute: bool = False) -> dict[str, int]:
    if len(password) < 12 or len(password) > 256:
        raise ValueError("Use a 12–256 character member password")
    if not execute:
        return {
            "members": 24,
            "recipes": 96,
            "partnerInquiries": 30,
            "questionsPerProduct": 4,
        }
    engine = create_engine(database_url)
    counts = {}
    now = datetime.now(UTC)
    first_hash = PASSWORD_HASHER.hash(password)
    closed_hash = PASSWORD_HASHER.hash(secrets.token_urlsafe(48))
    try:
        async with create_sessionmaker(engine)() as session, session.begin():
            await session.execute(text("SELECT pg_advisory_xact_lock(827340126)"))
            admin = await session.scalar(
                select(Admin).where(Admin.status == "active").order_by(Admin.created_at).limit(1)
            )
            products = list(
                await session.scalars(select(Product).order_by(Product.sort_order, Product.id))
            )
            ingredients = list(
                await session.scalars(select(Ingredient).order_by(Ingredient.sort_order))
            )
            if admin is None or len(products) < 3 or len(ingredients) < 4:
                raise ValueError("Seed catalog and create an operator before loading records")
            singles = [
                p
                for p in products
                if p.type_id != "gift-set"
                and p.price is not None
                and p.price > 0
                and p.stock >= 2
                and getattr(p, "is_active", True) is not False
            ]
            rules = {p.id: RuleIngredient(p.id, p.name, p.stage, p.color) for p in ingredients}

            async def add(model, key, **values):
                result = await session.execute(
                    insert(model)
                    .values(**values)
                    .on_conflict_do_nothing(index_elements=key)
                    .returning(*[model.__table__.c[name] for name in key])
                )
                counts[model.__tablename__] = counts.get(model.__tablename__, 0) + (
                    1 if result.first() else 0
                )

            def blend(number):
                return {
                    ingredients[(number + offset * 3) % len(ingredients)].id: value
                    for offset, value in enumerate((3, 4, 2))
                }

            for i in range(24):
                member = record_id("member", i)
                await add(
                    User,
                    ["id"],
                    id=member,
                    email=MEMBER_EMAIL if i == 0 else f"member-{i:02d}@example.com",
                    name=("김하늘", "박서연", "이도윤", "정지우", "최민서", "한유진")[i % 6]
                    + (str(i // 6 + 1) if i >= 6 else ""),
                    password_hash=first_hash if i == 0 else closed_hash,
                    marketing=False,
                    created_at=now - timedelta(days=30 - i),
                )
                await add(
                    UserCoupon,
                    ["id"],
                    id=record_id("coupon", i),
                    user_id=member,
                    type="FREE_SHIPPING",
                    status="AVAILABLE",
                )
                for version in range(4):
                    number = i * 4 + version
                    recipe_id = record_id("recipe", number)
                    drops = blend(number)
                    await add(
                        Recipe,
                        ["id"],
                        id=recipe_id,
                        user_id=member,
                        parent_id=record_id("recipe", number - 1) if version else None,
                        version=version + 1,
                        name=f"{SCENTS[number % len(SCENTS)]} {version + 1}",
                        label=("classic", "paper", "minimal")[version % 3],
                        color=mix_color(drops, rules),
                        created_at=now - timedelta(days=version, hours=i),
                    )
                    for ingredient_id, amount in drops.items():
                        await add(
                            RecipeIngredient,
                            ["recipe_id", "ingredient_id"],
                            recipe_id=recipe_id,
                            ingredient_id=ingredient_id,
                            count=amount,
                        )

            for i, product in enumerate(products):
                for n, (title, content, answer) in enumerate(QUESTIONS):
                    number = i * 4 + n
                    answered = n != 3
                    created = now - timedelta(days=number % 14, hours=number % 8)
                    await add(
                        ProductQuestion,
                        ["id"],
                        id=record_id("question", number),
                        product_id=product.id,
                        user_id=record_id("member", (i + n * 5) % 24),
                        title=title,
                        content=f"{product.name}에 대해 {content}",
                        private=n == 2,
                        answer=answer if answered else None,
                        answered_by=admin.id if answered else None,
                        answered_at=created + timedelta(hours=2) if answered else None,
                        version=2 if answered else 1,
                        created_at=created,
                    )

            for i in range(30):
                status = ("received", "reviewing", "done")[i % 3]
                inquiry = record_id("partner", i)
                created = now - timedelta(days=i % 12, hours=i % 7)
                await add(
                    PartnerInquiry,
                    ["id"],
                    id=inquiry,
                    brand=f"{SCENTS[i % len(SCENTS)]} 스튜디오 {i + 1:02d}",
                    name=("김수현", "이지안", "박도현", "정소연", "최지훈")[i % 5],
                    email=f"partner-{i + 1:02d}@example.com",
                    website=f"https://example.com/brands/{i + 1}",
                    type="향수",
                    introduction="일상에 향을 더하는 가상 라이프스타일 브랜드입니다.",
                    message=(
                        "컬렉션 협업과 입점 절차를 상담하고 싶습니다. "
                        "제품 구성과 진행 방법을 알려주세요."
                    ),
                    consent=True,
                    status=status,
                    internal_memo="담당자 검토 및 상담 진행 중" if status != "received" else "",
                    version=2 if status != "received" else 1,
                    created_at=created,
                    updated_at=created + timedelta(hours=4) if status != "received" else None,
                )
                if status != "received":
                    await add(
                        AdminAuditLog,
                        ["id"],
                        id=record_id("partner-audit", i),
                        actor_id=admin.id,
                        action="inquiry.update",
                        target_type="inquiry",
                        target_id=str(inquiry),
                        changes=[{"field": "status", "from": "received", "to": status}],
                        reason="상담 검토 및 진행 상태 변경",
                        created_at=created + timedelta(hours=4),
                    )
        from aura_api.services.orders import cancel_order, place_order

        async with create_sessionmaker(engine)() as session:
            for i in range(72):
                owner = record_id("member", 0 if i < 6 or i >= 68 else i % 24)
                product = singles[i % len(singles)]
                order, created = await place_order(
                    session,
                    owner,
                    {
                        "recipient": ("김하늘", "박서연", "이도윤", "정지우")[i % 4],
                        "recipient_phone": "010-0000-0000",
                        "address": f"한빛시 향기로 12 라온빌딩 {101 + i}호",
                        "delivery_note": (
                            "문 앞에 놓아주세요.",
                            "부재 시 경비실에 맡겨주세요.",
                            "도착 전 연락 부탁드립니다.",
                        )[i % 3],
                        "items": [{"productId": product.id, "quantity": 1 + i % 2}],
                    },
                    key=f"catalog-records-{i:03d}",
                )
                if created:
                    counts["orders"] = counts.get("orders", 0) + 1
                    if i < 60:
                        await cancel_order(session, owner, str(order.id))
        return counts
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    settings = Settings()
    password = os.environ.get("AURA_RECORDS_PASSWORD", "")
    if not args.execute:
        print(
            json.dumps(
                {
                    "dryRun": True,
                    "members": 24,
                    "recipes": 96,
                    "partnerInquiries": 30,
                    "questionsPerProduct": 4,
                }
            )
        )
        return
    if not password:
        raise SystemExit(
            "Set AURA_RECORDS_PASSWORD; it is never printed or written to the repository"
        )
    url = (
        settings.database_url_file.read_text().strip()
        if settings.database_url_file
        else settings.database_url.get_secret_value()
    )
    try:
        result = asyncio.run(seed(url, password, execute=True))
    except Exception:
        raise SystemExit("Record loading stopped; retry safely with the same password") from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
