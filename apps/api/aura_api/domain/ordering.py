"""Ordering domain: rebuild an order from client items and price it on the server.

The cart lives in the browser, so `POST /orders` sends its items. Nothing the client says
about price, product details or totals is trusted: every line is rebuilt from the catalog.
"""

import hashlib
import json
import re
from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from aura_api.domain.atelier import mix_color, normalize_label, validate_counts
from aura_api.domain.catalog import CUSTOM_PRODUCT_TYPE, Catalog, Product
from aura_api.domain.errors import Conflict, InvalidInput

MAX_QUANTITY = 15
GIFT_SET_SIZE = 3
FREE_SHIPPING_MIN = 50_000
BASIC_SHIPPING_FEE = 3_000
RECIPIENT_MAX = 100
ADDRESS_MAX = 500
IDEMPOTENCY_KEY = re.compile(r"^[A-Za-z0-9-]{8,64}$")

LineKind = Literal["product", "gift_set", "custom"]
OrderStatus = Literal["received", "paid", "preparing", "shipped", "delivered", "cancelled"]
ActorType = Literal["member", "admin", "system"]

# Order lifecycle. received: accepted, not paid · paid: PG approval verified by the server
# preparing: made/packed · shipped · delivered · cancelled. Terminal states allow nothing.
# An unpaid order never reaches preparing, and only a verified payment makes it paid.
ORDER_STATUSES: tuple[OrderStatus, ...] = (
    "received",
    "paid",
    "preparing",
    "shipped",
    "delivered",
    "cancelled",
)
INITIAL_ORDER_STATUS: OrderStatus = "received"
ORDER_TRANSITIONS: dict[str, frozenset[str]] = {
    "received": frozenset({"paid", "cancelled"}),
    "paid": frozenset({"preparing", "cancelled"}),
    "preparing": frozenset({"shipped", "cancelled"}),
    "shipped": frozenset({"delivered"}),
    "delivered": frozenset(),
    "cancelled": frozenset(),
}
STATUS_REASON_MAX = 200


@dataclass(frozen=True)
class CustomComposition:
    name: str
    label: str
    color: str  # recomputed from counts; the client's color is ignored
    counts: dict[str, int]
    product_type: str = CUSTOM_PRODUCT_TYPE


@dataclass(frozen=True)
class OrderLine:
    key: str
    kind: LineKind
    product: Product | None  # None for a custom composition
    selection: tuple[str, ...]
    custom: CustomComposition | None
    quantity: int
    unit_price: int

    @property
    def line_total(self) -> int:
        return self.unit_price * self.quantity


@dataclass(frozen=True)
class PricedOrder:
    lines: tuple[OrderLine, ...]
    recipient: str
    address: str
    items_amount: int
    shipping_fee: int
    use_coupon: bool
    stock_needs: dict[str, int]  # product id → units to reserve (singles + Gift Set contents)

    @property
    def total(self) -> int:
        return self.items_amount + self.shipping_fee


def shipping_fee(items_amount: int, use_coupon: bool) -> int:
    return 0 if items_amount >= FREE_SHIPPING_MIN or use_coupon else BASIC_SHIPPING_FEE


def is_gift_selection_valid(gift: Product, selection: Sequence[str], catalog: Catalog) -> bool:
    """Exactly 3 different single products from the gift set's collection, all in stock."""
    if not gift.is_gift_set or len(selection) != GIFT_SET_SIZE or len(set(selection)) != 3:
        return False
    for product_id in selection:
        product = catalog.product(product_id)
        if (
            product is None
            or product.collection != gift.collection
            or product.is_gift_set
            or product.stock <= 0
        ):
            return False
    return True


def gift_set_price(selection: Sequence[str], catalog: Catalog) -> int | None:
    """Sum of the three chosen products; unknown if any of them has no price."""
    prices = [catalog.products[product_id].price for product_id in selection]
    return None if any(price is None for price in prices) else sum(prices)  # type: ignore[arg-type]


def product_key(product_id: str, selection: Sequence[str]) -> str:
    return f"{product_id}:{','.join(sorted(selection))}"


def custom_key(custom: CustomComposition) -> str:
    """Identical compositions merge into one line; any edit makes a new line."""
    signature = json.dumps(
        [custom.name, custom.label, custom.product_type, sorted(custom.counts.items())],
        ensure_ascii=False,
    )
    return "custom:" + hashlib.sha256(signature.encode()).hexdigest()[:16]


def _quantity(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= MAX_QUANTITY:
        raise InvalidInput("QUANTITY_INVALID", "수량을 확인해 주세요.")
    return value


def _custom(raw: object, catalog: Catalog) -> CustomComposition:
    if not isinstance(raw, Mapping):
        raise InvalidInput("ITEM_INVALID", "상품 또는 맞춤 조향 중 하나를 선택해 주세요.")
    product_type = raw.get("productType")
    if product_type is not None and product_type != CUSTOM_PRODUCT_TYPE:
        raise InvalidInput(
            "CUSTOM_TYPE_UNSUPPORTED", "맞춤 조향은 현재 오 드 퍼퓸 50mL만 제공해요."
        )
    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        raise InvalidInput("CUSTOM_INVALID", "상품과 향료 구성을 확인해 주세요.")
    try:
        name.encode("utf-8")
    except UnicodeEncodeError:
        raise InvalidInput("CUSTOM_INVALID", "상품과 향료 구성을 확인해 주세요.") from None
    try:
        counts = validate_counts(raw.get("counts"), catalog.ingredients)
    except InvalidInput as error:
        raise InvalidInput("CUSTOM_INVALID", "상품과 향료 구성을 확인해 주세요.") from error
    return CustomComposition(
        name=name.strip(),
        label=normalize_label(raw.get("label")),
        color=mix_color(counts, catalog.ingredients),
        counts=counts,
    )


def build_line(raw: object, catalog: Catalog, *, allow_custom: bool = True) -> OrderLine:
    """One `OrderItemInput`: `{ productId?, quantity, selection?, custom? }`."""
    if not isinstance(raw, Mapping):
        raise InvalidInput("ITEM_INVALID", "상품 정보를 확인해 주세요.")
    product_id, custom_raw = raw.get("productId"), raw.get("custom")
    if (product_id is None) == (custom_raw is None):
        raise InvalidInput("ITEM_INVALID", "상품 또는 맞춤 조향 중 하나를 선택해 주세요.")
    quantity = _quantity(raw.get("quantity"))

    if custom_raw is not None:
        if not allow_custom:
            raise InvalidInput("CUSTOM_NOT_ORDERABLE", "맞춤 조향은 아직 주문할 수 없어요.")
        custom = _custom(custom_raw, catalog)
        price = catalog.custom_base_price()
        if price is None:
            raise InvalidInput("PRICE_UNKNOWN", "주문 금액을 확인해 주세요.")
        return OrderLine(custom_key(custom), "custom", None, (), custom, quantity, price)

    product = catalog.product(product_id) if isinstance(product_id, str) else None
    if product is None or product.stock < 1:
        raise InvalidInput("PRODUCT_UNAVAILABLE", "현재 선택할 수 없는 상품이에요.")
    if product.is_gift_set:
        selection = raw.get("selection")
        if not isinstance(selection, list) or not all(isinstance(s, str) for s in selection):
            raise InvalidInput("GIFT_SET_INVALID", "같은 컬렉션의 제품 3개를 선택해 주세요.")
        if not is_gift_selection_valid(product, selection, catalog):
            raise InvalidInput("GIFT_SET_INVALID", "같은 컬렉션의 제품 3개를 선택해 주세요.")
        price = gift_set_price(selection, catalog)
        kind: LineKind = "gift_set"
        chosen = tuple(sorted(selection))
    else:
        price, kind, chosen = product.price, "product", ()
    if price is None:
        raise InvalidInput("PRICE_UNKNOWN", "주문 금액을 확인해 주세요.")
    return OrderLine(product_key(product.id, chosen), kind, product, chosen, None, quantity, price)


def merge_lines(lines: Sequence[OrderLine]) -> tuple[OrderLine, ...]:
    """Same key → quantities add up; more than 15 of one line is rejected, not clamped."""
    merged: dict[str, OrderLine] = {}
    for line in lines:
        existing = merged.get(line.key)
        if existing is None:
            merged[line.key] = line
            continue
        total = existing.quantity + line.quantity
        if total > MAX_QUANTITY:
            raise InvalidInput("QUANTITY_INVALID", "수량을 확인해 주세요.")
        merged[line.key] = OrderLine(
            existing.key,
            existing.kind,
            existing.product,
            existing.selection,
            existing.custom,
            total,
            existing.unit_price,
        )
    return tuple(merged.values())


def stock_needs(lines: Sequence[OrderLine]) -> dict[str, int]:
    """Singles and Gift Set contents draw on the same product stock. Custom lines use none."""
    needs: Counter[str] = Counter()
    for line in lines:
        if line.product is None:
            continue
        needs[line.product.id] += line.quantity
        for product_id in line.selection:
            needs[product_id] += line.quantity
    return dict(needs)


def restock_needs(lines: Iterable[tuple[str, str, int, Sequence[str]]]) -> dict[str, int]:
    """Stock to give back for stored order lines (kind, product ID, quantity, Gift Set picks).

    Mirrors `stock_needs`: products and Gift Set contents were taken, custom lines took none.
    """
    needs: Counter[str] = Counter()
    for kind, product_id, quantity, selection in lines:
        if kind == "custom":
            continue
        needs[product_id] += quantity
        for chosen in selection:
            needs[chosen] += quantity
    return dict(needs)


def ensure_stock(needs: Mapping[str, int], catalog: Catalog) -> None:
    """Pre-check against the catalog snapshot. The DB's conditional decrement is the final say."""
    for product_id, quantity in needs.items():
        product = catalog.product(product_id)
        if product is None or quantity > product.stock:
            raise InvalidInput("OUT_OF_STOCK", "상품 재고를 확인해 주세요.")


def _required_text(value: object, max_length: int, code: str, message: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > max_length:
        raise InvalidInput(code, message)
    return value.strip()


def price_order(
    items: object,
    catalog: Catalog,
    *,
    recipient: object,
    address: object,
    use_coupon: bool,
    coupon_available: bool,
    allow_custom: bool = True,
) -> PricedOrder:
    """Validate and price `POST /orders`. A rejected order changes nothing (caller rolls back)."""
    if not isinstance(items, list) or not items:
        raise InvalidInput("ITEMS_REQUIRED", "주문할 상품을 확인해 주세요.")
    lines = merge_lines([build_line(raw, catalog, allow_custom=allow_custom) for raw in items])
    needs = stock_needs(lines)
    ensure_stock(needs, catalog)
    recipient_text = _required_text(
        recipient, RECIPIENT_MAX, "RECIPIENT_REQUIRED", "받는 분을 입력해 주세요."
    )
    address_text = _required_text(address, ADDRESS_MAX, "ADDRESS_REQUIRED", "주소를 입력해 주세요.")
    if use_coupon and not coupon_available:
        raise InvalidInput("COUPON_UNAVAILABLE", "사용할 수 없는 쿠폰이에요.")
    items_amount = sum(line.line_total for line in lines)
    return PricedOrder(
        lines=lines,
        recipient=recipient_text,
        address=address_text,
        items_amount=items_amount,
        shipping_fee=shipping_fee(items_amount, use_coupon),
        use_coupon=use_coupon,
        stock_needs=needs,
    )


def idempotency_key(value: object) -> str | None:
    """Optional key that makes resending the same order safe (8–64 letters, digits, hyphens)."""
    if value is None:
        return None
    if not isinstance(value, str) or not IDEMPOTENCY_KEY.match(value):
        raise InvalidInput("IDEMPOTENCY_KEY_INVALID", "요청 식별자를 확인해 주세요.")
    return value


def ensure_status_change(
    current: str, new: object, reason: object = None, *, payment_verified: bool = False
) -> str | None:
    """Check one order status change and return its optional reason.

    `paid` is only reachable from the payment service after the PG approval was verified.
    """
    if new not in ORDER_STATUSES:
        raise InvalidInput("ORDER_STATUS_INVALID", "주문 상태를 확인해 주세요.")
    if new == "paid" and not payment_verified:
        raise Conflict("ORDER_PAYMENT_REQUIRED", "결제 승인으로만 결제 완료가 돼요.")
    if new not in ORDER_TRANSITIONS[current]:
        raise Conflict("ORDER_STATUS_CONFLICT", "현재 주문 상태에서는 변경할 수 없어요.")
    if reason is None:
        return None
    if not isinstance(reason, str) or len(reason.strip()) > STATUS_REASON_MAX:
        raise InvalidInput("ORDER_STATUS_REASON_INVALID", "변경 사유를 확인해 주세요.")
    return reason.strip() or None
