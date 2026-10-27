"""Admin domain: input rules for product edits, stock adjustments and inquiry handling.

Messages match the Mock admin API so the admin screens show the same text.
"""

import re
from collections.abc import Collection, Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from aura_api.domain.errors import Conflict, InvalidInput

PAGE_SIZE = 20
LOW_STOCK = 5
MAX_STOCK = 99_999
MAX_PRICE = 10_000_000
MAX_PAGE = 10_000
HISTORY_LIMIT = 30
RECENT_DAYS = 7
MEMO_MAX = 2000
REASON_MAX = 200
INQUIRY_STATUSES = ("received", "reviewing", "done")
KST = timezone(timedelta(hours=9))
REQUEST_KEY = re.compile(r"^[A-Za-z0-9-]{8,64}$")
DATE_INPUT = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Editable text fields and their limits (same as the Mock admin API).
TEXT_FIELDS = {"name": 100, "english_name": 100, "description": 1000}


def version_conflict() -> Conflict:
    return Conflict(
        "VERSION_CONFLICT",
        "다른 작업으로 정보가 변경되었어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
    )


def page_number(value: object) -> int:
    """Out-of-range or malformed pages fall back to 1, as the web client does."""
    try:
        page = int(str(value)) if value is not None else 1
    except ValueError:
        return 1
    return page if 1 <= page <= MAX_PAGE else 1


def check_version(value: object, current: int) -> None:
    """Optimistic lock: the edit must be based on the version the admin last saw."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise InvalidInput("VERSION_REQUIRED", "수정 기준 버전을 확인해 주세요.")
    if value != current:
        raise version_conflict()


def product_changes(raw: Mapping[str, Any], image_options: Collection[str]) -> dict[str, Any]:
    """Validated new values keyed by column name. Absent fields are left unchanged."""
    changes: dict[str, Any] = {}
    for field, limit in TEXT_FIELDS.items():
        key = "englishName" if field == "english_name" else field
        if key in raw and raw[key] is not None:
            value = raw[key]
            if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
                raise InvalidInput("PRODUCT_INVALID", "상품 정보를 확인해 주세요.")
            changes[field] = value.strip()
    if "price" in raw:
        price = raw["price"]
        if price is not None and (
            isinstance(price, bool) or not isinstance(price, int) or not 0 <= price <= MAX_PRICE
        ):
            raise InvalidInput(
                "PRICE_INVALID", "가격은 0원 이상 1,000만 원 이하의 정수로 입력해 주세요."
            )
        changes["price"] = price
    if "image" in raw and raw["image"] is not None:
        if raw["image"] not in image_options:
            raise InvalidInput("IMAGE_INVALID", "등록된 상품 이미지 중에서 선택해 주세요.")
        changes["image"] = raw["image"]
    for field, key in (("featured", "featured"), ("is_new", "isNew")):
        if key in raw and raw[key] is not None:
            if not isinstance(raw[key], bool):
                raise InvalidInput("DISPLAY_INVALID", "상품 노출 설정을 확인해 주세요.")
            changes[field] = raw[key]
    return changes


@dataclass(frozen=True)
class StockAdjustment:
    delta: int
    reason: str
    key: str


def stock_request(raw: Mapping[str, Any]) -> StockAdjustment:
    """Reason and key are checked first: a resent request is recognised before anything else."""
    reason = raw.get("reason")
    if not isinstance(reason, str) or not reason.strip() or len(reason.strip()) > REASON_MAX:
        raise InvalidInput("REASON_REQUIRED", "재고 조정 사유를 입력해 주세요.")
    key = raw.get("key")
    if not isinstance(key, str) or not REQUEST_KEY.match(key):
        raise InvalidInput("REQUEST_KEY_INVALID", "요청 식별자를 확인해 주세요.")
    delta = raw.get("delta")
    return StockAdjustment(delta=delta, reason=reason.strip(), key=key)  # type: ignore[arg-type]


def adjusted_stock(current: int, delta: object) -> int:
    if (
        isinstance(delta, bool)
        or not isinstance(delta, int)
        or delta == 0
        or abs(delta) > MAX_STOCK
    ):
        raise InvalidInput("DELTA_INVALID", "조정 수량을 0이 아닌 정수로 입력해 주세요.")
    stock = current + delta
    if not 0 <= stock <= MAX_STOCK:
        raise InvalidInput(
            "STOCK_OUT_OF_RANGE", f"조정 후 재고는 0개 이상 {MAX_STOCK:,}개 이하여야 해요."
        )
    return stock


def ensure_same_request(
    previous_product_id: str, previous: StockAdjustment, product_id: str, request: StockAdjustment
) -> None:
    """The same key may only repeat the same adjustment."""
    if (
        previous_product_id != product_id
        or previous.delta != request.delta
        or previous.reason != request.reason
    ):
        raise Conflict("REQUEST_KEY_USED", "이미 사용한 요청 식별자예요. 새로 시도해 주세요.")


def date_range(start: object, end: object) -> tuple[datetime | None, datetime | None]:
    """`YYYY-MM-DD` business days in Korea; `end` includes the whole selected day."""

    def parse(value: object) -> date | None:
        if value is None:
            return None
        if not isinstance(value, str) or not DATE_INPUT.match(value):
            raise InvalidInput("PERIOD_INVALID", "조회 기간을 확인해 주세요.")
        try:
            return date.fromisoformat(value)
        except ValueError as error:
            raise InvalidInput("PERIOD_INVALID", "조회 기간을 확인해 주세요.") from error

    first, last = parse(start), parse(end)
    since = datetime.combine(first, time(), KST) if first else None
    until = datetime.combine(last, time(), KST) + timedelta(days=1) if last else None
    if since and until and since >= until:
        raise InvalidInput("PERIOD_REVERSED", "조회 시작일이 종료일보다 늦어요.")
    return since, until


def inquiry_changes(raw: Mapping[str, Any], status: str, memo: str) -> list[dict[str, Any]]:
    """Field-level diff for the audit log; an unchanged value produces no entry."""
    new_status, new_memo = raw.get("status"), raw.get("memo")
    if new_status is not None and new_status not in INQUIRY_STATUSES:
        raise InvalidInput("STATUS_INVALID", "처리 상태를 확인해 주세요.")
    if new_memo is not None and (not isinstance(new_memo, str) or len(new_memo) > MEMO_MAX):
        raise InvalidInput("MEMO_INVALID", "내부 메모는 2,000자 이하로 입력해 주세요.")
    changes = []
    if new_status is not None and new_status != status:
        changes.append({"field": "status", "from": status, "to": new_status})
    if new_memo is not None and new_memo.strip() != memo:
        changes.append({"field": "memo", "from": memo, "to": new_memo.strip()})
    return changes
