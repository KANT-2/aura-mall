"""Add clearly marked, repeatable fictional presentation data without PG/network calls.

Run --execute with AURA_DEMO_PASSWORD in the environment. Existing rows and passwords
are preserved. Synthetic orders are read only, never reserve stock, and use provider=demo.
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
    Order,
    OrderItem,
    OrderStatusHistory,
    PartnerInquiry,
    Payment,
    Product,
    ProductQuestion,
    ProductType,
    Recipe,
    RecipeIngredient,
    Refund,
    User,
    UserCoupon,
)
from aura_api.services.orders import custom_snapshot, product_snapshot

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://aura.example.invalid/presentation/v1")
DEMO_EMAIL = "demo@aura.example.invalid"
STATES = ("received", "paid", "preparing", "shipped", "delivered", "cancelled")
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


def demo_id(kind: str, number: int) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{kind}:{number}")


async def seed(database_url: str, password: str, *, execute: bool = False) -> dict[str, int]:
    if len(password) < 12 or len(password) > 256:
        raise ValueError("Use a 12–256 character demo password")
    if not execute:
        return {
            "members": 24,
            "recipes": 96,
            "orders": 72,
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
            type_names = dict(
                (await session.execute(select(ProductType.id, ProductType.name))).all()
            )
            if admin is None or len(products) < 3 or len(ingredients) < 4:
                raise ValueError("Seed catalog and create an operator before demonstration data")
            singles = [
                p
                for p in products
                if p.type_id != "gift-set" and p.price is not None and p.price > 0
            ]
            base = next(p for p in singles if p.type_id == "eau-de-parfum")
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
                member = demo_id("member", i)
                await add(
                    User,
                    ["id"],
                    id=member,
                    email=DEMO_EMAIL if i == 0 else f"demo-{i:02d}@aura.example.invalid",
                    name="시연 체험회원" if i == 0 else f"시연 고객 {i:02d}",
                    password_hash=first_hash if i == 0 else closed_hash,
                    marketing=False,
                    created_at=now - timedelta(days=30 - i),
                )
                await add(
                    UserCoupon,
                    ["id"],
                    id=demo_id("coupon", i),
                    user_id=member,
                    type="FREE_SHIPPING",
                    status="AVAILABLE",
                )
                for version in range(4):
                    number = i * 4 + version
                    recipe_id = demo_id("recipe", number)
                    drops = blend(number)
                    await add(
                        Recipe,
                        ["id"],
                        id=recipe_id,
                        user_id=member,
                        parent_id=demo_id("recipe", number - 1) if version else None,
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

            for i in range(72):
                status = STATES[i % 6]
                owner = demo_id("member", 0 if i < 6 else (i // 6 + i % 6 * 3) % 24)
                order_id = demo_id("order", i)
                created = now - timedelta(days=i // 6, hours=i % 6)
                lines = []
                for position in range(1 + i % 3):
                    product = singles[(i * 3 + position) % len(singles)]
                    custom = None
                    if i % 6 == 3 and position == 0:
                        drops = blend(i)
                        custom = {
                            "name": "[시연] " + SCENTS[i % len(SCENTS)],
                            "label": "paper",
                            "counts": drops,
                            "color": mix_color(drops, rules),
                            "productType": "eau-de-parfum",
                        }
                        product = base
                    snapshot = (
                        custom_snapshot(custom["name"], product, type_names[product.type_id])
                        if custom
                        else product_snapshot(product, type_names[product.type_id])
                    )
                    lines.append(
                        dict(
                            id=demo_id("line", i * 3 + position),
                            order_id=order_id,
                            position=position,
                            line_key=f"demo-{i}-{position}",
                            kind="custom" if custom else "product",
                            product_id=snapshot["id"],
                            product_snapshot=snapshot,
                            unit_price=product.price,
                            quantity=1 + i % 2,
                            custom=custom,
                        )
                    )
                subtotal = sum(line["unit_price"] * line["quantity"] for line in lines)
                shipping = 0 if subtotal >= 50000 else 3000
                await add(
                    Order,
                    ["id"],
                    id=order_id,
                    user_id=owner,
                    is_demo=True,
                    recipient=f"[시연] 수령인 {i + 1:02d}",
                    recipient_phone="010-0000-0000",
                    address=f"시연시 향기로 100 가상빌딩 {101 + i}호 (시연용 주소)",
                    delivery_note="[시연] 현관 앞 보관 요청 예시",
                    courier="시연 택배" if status in ("shipped", "delivered") else "",
                    tracking_number=f"DEMO-{i + 1:08d}"
                    if status in ("shipped", "delivered")
                    else "",
                    items_amount=subtotal,
                    shipping_fee=shipping,
                    total=subtotal + shipping,
                    status=status,
                    idempotency_key=f"demo-fixture-{i:03d}",
                    created_at=created,
                )
                for line in lines:
                    await add(OrderItem, ["id"], **line)
                paid = status in ("paid", "preparing", "shipped", "delivered") or (
                    status == "cancelled" and i // 6 % 2 == 1
                )
                sequence = ["received"] + (
                    ["paid", "preparing", "shipped", "delivered"][: STATES.index(status)]
                    if status != "cancelled"
                    else ["paid", "cancelled"]
                    if paid
                    else ["cancelled"]
                )
                for step, state in enumerate(sequence):
                    await add(
                        OrderStatusHistory,
                        ["id"],
                        id=demo_id("history", i * 6 + step),
                        order_id=order_id,
                        from_status=sequence[step - 1] if step else None,
                        to_status=state,
                        actor_type="system",
                        actor_id=None,
                        reason="시연용 이력 · 실제 처리 아님",
                        changed_at=created + timedelta(minutes=step),
                    )
                payment_id = demo_id("payment", i)
                pg_status = (
                    "DONE"
                    if paid
                    else "CANCELED"
                    if status == "cancelled"
                    else "IN_PROGRESS"
                    if i // 6 % 2
                    else "READY"
                )
                await add(
                    Payment,
                    ["id"],
                    id=payment_id,
                    order_id=order_id,
                    provider="demo",
                    pg_order_id=f"demo-presentation-{i:03d}",
                    payment_key=f"demo-not-a-pg-key-{i:03d}"
                    if pg_status in ("DONE", "IN_PROGRESS")
                    else None,
                    amount=subtotal + shipping,
                    status=pg_status,
                    method="시연 결제수단" if paid else None,
                    confirm_started_at=created + timedelta(seconds=10)
                    if pg_status in ("DONE", "IN_PROGRESS")
                    else None,
                    approved_at=created + timedelta(seconds=20) if paid else None,
                    review_reason="DEMO_REVIEW_EXAMPLE"
                    if status == "paid" and i // 6 % 3 == 0
                    else None,
                    created_at=created,
                    updated_at=created + timedelta(seconds=20),
                )
                if (status == "cancelled" and paid) or (status == "paid" and i // 6 % 3 != 2):
                    refund_status = (
                        "DONE"
                        if status == "cancelled"
                        else "IN_PROGRESS"
                        if i // 6 % 3 == 0
                        else "FAILED"
                    )
                    await add(
                        Refund,
                        ["id"],
                        id=demo_id("refund", i),
                        order_id=order_id,
                        payment_id=payment_id,
                        amount=subtotal + shipping,
                        status=refund_status,
                        reason="[시연] 전액 환불 사례",
                        actor_type="system",
                        actor_id=None,
                        requested_at=created + timedelta(hours=1),
                        refunded_at=created + timedelta(hours=1, minutes=2)
                        if refund_status == "DONE"
                        else None,
                        transaction_key=f"demo-refund-{i:03d}" if refund_status == "DONE" else None,
                        review_reason="DEMO_REFUND_EXAMPLE" if refund_status == "FAILED" else None,
                        updated_at=created + timedelta(hours=1, minutes=2),
                    )

            for i, product in enumerate(products):
                for n, (title, content, answer) in enumerate(QUESTIONS):
                    number = i * 4 + n
                    answered = n != 3
                    created = now - timedelta(days=number % 14, hours=number % 8)
                    await add(
                        ProductQuestion,
                        ["id"],
                        id=demo_id("question", number),
                        product_id=product.id,
                        user_id=demo_id("member", (i + n * 5) % 24),
                        title=f"[시연] {title}",
                        content=f"[시연용 문의] {product.name}에 대해 {content}",
                        private=n == 2,
                        answer=f"[시연 답변] {answer}" if answered else None,
                        answered_by=admin.id if answered else None,
                        answered_at=created + timedelta(hours=2) if answered else None,
                        version=2 if answered else 1,
                        created_at=created,
                    )

            for i in range(30):
                status = ("received", "reviewing", "done")[i % 3]
                inquiry = demo_id("partner", i)
                created = now - timedelta(days=i % 12, hours=i % 7)
                await add(
                    PartnerInquiry,
                    ["id"],
                    id=inquiry,
                    brand=f"[시연] {SCENTS[i % len(SCENTS)]} 스튜디오 {i + 1:02d}",
                    name=f"시연 담당자 {i + 1:02d}",
                    email=f"demo-partner-{i + 1:02d}@example.invalid",
                    website=f"https://example.invalid/demo/{i + 1}",
                    type="향수",
                    introduction="[시연] 일상에 향을 더하는 가상 라이프스타일 브랜드입니다.",
                    message=(
                        "[시연] 컬렉션 협업과 입점 절차를 상담하고 싶습니다. "
                        "제품 구성과 진행 방법을 알려주세요."
                    ),
                    consent=True,
                    status=status,
                    internal_memo="[시연] 담당자 검토 및 상담 진행 예시"
                    if status != "received"
                    else "",
                    version=2 if status != "received" else 1,
                    created_at=created,
                    updated_at=created + timedelta(hours=4) if status != "received" else None,
                )
                if status != "received":
                    await add(
                        AdminAuditLog,
                        ["id"],
                        id=demo_id("partner-audit", i),
                        actor_id=admin.id,
                        action="inquiry.update",
                        target_type="inquiry",
                        target_id=str(inquiry),
                        changes=[{"field": "status", "from": "received", "to": status}],
                        reason="시연용 상담 처리 이력",
                        created_at=created + timedelta(hours=4),
                    )
        return counts
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    settings = Settings()
    password = os.environ.get("AURA_DEMO_PASSWORD", "")
    if not args.execute:
        print(
            json.dumps(
                {
                    "dryRun": True,
                    "members": 24,
                    "recipes": 96,
                    "orders": 72,
                    "partnerInquiries": 30,
                    "questionsPerProduct": 4,
                }
            )
        )
        return
    if not password:
        raise SystemExit("Set AURA_DEMO_PASSWORD; it is never printed or written to the repository")
    url = (
        settings.database_url_file.read_text().strip()
        if settings.database_url_file
        else settings.database_url.get_secret_value()
    )
    try:
        result = asyncio.run(seed(url, password, execute=True))
    except Exception:
        raise SystemExit("Demo seed failed; no changes committed") from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
