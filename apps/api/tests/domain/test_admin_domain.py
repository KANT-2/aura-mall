from datetime import datetime

import pytest

from aura_api.domain.admin import (
    KST,
    StockAdjustment,
    adjusted_stock,
    check_version,
    date_range,
    ensure_same_request,
    inquiry_changes,
    page_number,
    product_changes,
    stock_request,
)
from aura_api.domain.errors import Conflict, InvalidInput

IMAGES = {"/assets/products/a.webp", "/assets/products/b.webp"}


@pytest.mark.parametrize(
    ("value", "page"),
    [(None, 1), ("3", 3), ("0", 1), ("-2", 1), ("abc", 1), ("10001", 1), ("10000", 10000)],
)
def test_page_number_falls_back_to_first_page(value, page):
    assert page_number(value) == page


def test_version_must_match_exactly():
    check_version(3, 3)
    with pytest.raises(InvalidInput):
        check_version("3", 3)
    with pytest.raises(InvalidInput):
        check_version(True, 1)
    with pytest.raises(Conflict) as error:
        check_version(2, 3)
    assert error.value.message.startswith("다른 작업으로 정보가 변경되었어요.")


def test_product_changes_keep_only_sent_fields_and_trim_text():
    changes = product_changes(
        {"version": 1, "name": " 새 이름 ", "isNew": True, "price": None}, IMAGES
    )

    assert changes == {"name": "새 이름", "is_new": True, "price": None}


@pytest.mark.parametrize(
    ("raw", "code"),
    [
        ({"name": "  "}, "PRODUCT_INVALID"),
        ({"description": "가" * 1001}, "PRODUCT_INVALID"),
        ({"price": -1}, "PRICE_INVALID"),
        ({"price": 10_000_001}, "PRICE_INVALID"),
        ({"price": 1.5}, "PRICE_INVALID"),
        ({"image": "/other.webp"}, "IMAGE_INVALID"),
        ({"featured": "yes"}, "DISPLAY_INVALID"),
    ],
)
def test_product_changes_reject_bad_values(raw, code):
    with pytest.raises(InvalidInput) as error:
        product_changes(raw, IMAGES)
    assert error.value.code == code


def test_stock_request_needs_reason_and_key():
    request = stock_request({"delta": 3, "reason": " 입고 ", "key": "abc-12345"})

    assert request == StockAdjustment(3, "입고", "abc-12345")
    with pytest.raises(InvalidInput, match="사유"):
        stock_request({"delta": 3, "reason": "", "key": "abc-12345"})
    with pytest.raises(InvalidInput, match="요청 식별자"):
        stock_request({"delta": 3, "reason": "입고", "key": "short"})


def test_adjusted_stock_stays_within_range():
    assert adjusted_stock(10, -4) == 6
    for delta in (0, 1.5, True, 100_000):
        with pytest.raises(InvalidInput, match="0이 아닌 정수"):
            adjusted_stock(10, delta)
    with pytest.raises(InvalidInput, match="99,999개"):
        adjusted_stock(3, -4)


def test_same_key_may_only_repeat_the_same_adjustment():
    first = StockAdjustment(3, "입고", "abc-12345")
    ensure_same_request("p1", first, "p1", StockAdjustment(3, "입고", "abc-12345"))
    for product, request in [
        ("p2", first),
        ("p1", StockAdjustment(4, "입고", "abc-12345")),
        ("p1", StockAdjustment(3, "반품", "abc-12345")),
    ]:
        with pytest.raises(Conflict):
            ensure_same_request("p1", first, product, request)


def test_date_range_uses_korean_business_days():
    since, until = date_range("2026-10-01", "2026-10-01")

    assert since == datetime(2026, 10, 1, tzinfo=KST)
    assert until == datetime(2026, 10, 2, tzinfo=KST)
    assert date_range(None, None) == (None, None)
    with pytest.raises(InvalidInput, match="조회 기간"):
        date_range("2026-13-01", None)
    with pytest.raises(InvalidInput, match="늦어요"):
        date_range("2026-10-02", "2026-10-01")


def test_inquiry_changes_record_only_real_edits():
    assert inquiry_changes({"status": "received", "memo": ""}, "received", "") == []
    assert inquiry_changes({"status": "done", "memo": " 확인 "}, "received", "") == [
        {"field": "status", "from": "received", "to": "done"},
        {"field": "memo", "from": "", "to": "확인"},
    ]
    with pytest.raises(InvalidInput, match="처리 상태"):
        inquiry_changes({"status": "closed"}, "received", "")
    with pytest.raises(InvalidInput, match="2,000자"):
        inquiry_changes({"memo": "가" * 2001}, "received", "")
