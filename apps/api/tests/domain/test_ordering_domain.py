import pytest

from aura_api.domain.errors import InvalidInput
from aura_api.domain.ordering import (
    build_line,
    price_order,
    shipping_fee,
)

GIFT = {
    "productId": "fresh-gift-set",
    "quantity": 1,
    "selection": ["fresh-candle", "fresh-hand-cream", "fresh-eau-de-parfum"],
}


def order(catalog, items, *, use_coupon=False, coupon_available=False, **kwargs):
    return price_order(
        items,
        catalog,
        recipient=kwargs.get("recipient", "김철수"),
        address=kwargs.get("address", "서울시 어딘가 1"),
        use_coupon=use_coupon,
        coupon_available=coupon_available,
        allow_custom=kwargs.get("allow_custom", True),
    )


@pytest.mark.parametrize(
    ("amount", "coupon", "fee"),
    [(49_999, False, 3_000), (50_000, False, 0), (10_000, True, 0)],
)
def test_shipping_fee(amount, coupon, fee):
    assert shipping_fee(amount, coupon) == fee


def test_single_product_uses_catalog_price(catalog):
    line = build_line({"productId": "fresh-hand-cream", "quantity": 2, "price": 1}, catalog)

    assert (line.kind, line.unit_price, line.line_total) == ("product", 28_000, 56_000)


def test_gift_set_price_is_the_sum_of_its_three_products(catalog):
    line = build_line(GIFT, catalog)

    assert line.kind == "gift_set"
    assert line.unit_price == 28_000 + 98_000 + 62_000
    assert line.key == "fresh-gift-set:fresh-candle,fresh-eau-de-parfum,fresh-hand-cream"


@pytest.mark.parametrize(
    "selection",
    [
        ["fresh-candle", "fresh-hand-cream"],  # 2 products
        ["fresh-candle", "fresh-candle", "fresh-hand-cream"],  # duplicate
        ["fresh-candle", "fresh-hand-cream", "soft-hand-cream"],  # other collection
        ["fresh-candle", "fresh-hand-cream", "fresh-gift-set"],  # gift set inside gift set
        ["fresh-candle", "fresh-hand-cream", "fresh-diffuser"],  # out of stock
        "fresh-candle",
    ],
)
def test_gift_set_rejects_invalid_selection(catalog, selection):
    with pytest.raises(InvalidInput) as error:
        build_line({**GIFT, "selection": selection}, catalog)

    assert error.value.code == "GIFT_SET_INVALID"


def test_gift_set_with_unpriced_product_cannot_be_ordered(catalog):
    with pytest.raises(InvalidInput) as error:
        build_line(
            {**GIFT, "selection": ["fresh-candle", "fresh-hand-cream", "fresh-mystery"]}, catalog
        )

    assert error.value.code == "PRICE_UNKNOWN"


@pytest.mark.parametrize("quantity", [0, 16, 1.5, True, None, "2"])
def test_quantity_must_be_1_to_15(catalog, quantity):
    with pytest.raises(InvalidInput) as error:
        build_line({"productId": "fresh-hand-cream", "quantity": quantity}, catalog)

    assert error.value.code == "QUANTITY_INVALID"


@pytest.mark.parametrize(
    "item",
    [
        {"quantity": 1},
        {"productId": "fresh-hand-cream", "custom": {"name": "x"}, "quantity": 1},
        {"productId": "missing", "quantity": 1},
        {"productId": "fresh-diffuser", "quantity": 1},
        "fresh-hand-cream",
    ],
)
def test_item_needs_exactly_one_available_target(catalog, item):
    with pytest.raises(InvalidInput):
        build_line(item, catalog)


def test_unpriced_single_product_cannot_be_ordered(catalog):
    with pytest.raises(InvalidInput) as error:
        build_line({"productId": "fresh-mystery", "quantity": 1}, catalog)

    assert error.value.code == "PRICE_UNKNOWN"


def test_custom_composition_uses_eau_de_parfum_price_and_server_color(catalog):
    line = build_line(
        {
            "custom": {"name": "느린 오후", "counts": {"bergamot": 1}, "color": "#000000"},
            "quantity": 1,
        },
        catalog,
    )

    assert (line.kind, line.unit_price) == ("custom", 98_000)
    assert line.custom.color == "#a5ad68"


def test_custom_composition_rules(catalog):
    with pytest.raises(InvalidInput) as error:
        build_line(
            {
                "custom": {"name": "x", "counts": {"bergamot": 1}, "productType": "candle"},
                "quantity": 1,
            },
            catalog,
        )
    assert error.value.code == "CUSTOM_TYPE_UNSUPPORTED"

    with pytest.raises(InvalidInput) as error:
        build_line({"custom": {"name": "x", "counts": {"bergamot": 21}}, "quantity": 1}, catalog)
    assert error.value.code == "CUSTOM_INVALID"

    with pytest.raises(InvalidInput) as error:
        build_line(
            {"custom": {"name": "x", "counts": {"bergamot": 1}}, "quantity": 1},
            catalog,
            allow_custom=False,
        )
    assert error.value.code == "CUSTOM_NOT_ORDERABLE"


def test_same_items_merge_and_reject_over_15(catalog):
    priced = order(
        catalog,
        [
            {"productId": "fresh-hand-cream", "quantity": 4},
            {"productId": "fresh-hand-cream", "quantity": 3},
        ],
    )
    assert [(line.key, line.quantity) for line in priced.lines] == [("fresh-hand-cream:", 7)]

    with pytest.raises(InvalidInput) as error:
        order(
            catalog,
            [
                {"productId": "fresh-hand-cream", "quantity": 10},
                {"productId": "fresh-hand-cream", "quantity": 6},
            ],
        )
    assert error.value.code == "QUANTITY_INVALID"


def test_gift_set_contents_share_stock_with_singles(catalog):
    priced = order(catalog, [GIFT, {"productId": "fresh-hand-cream", "quantity": 2}])

    assert priced.stock_needs == {
        "fresh-gift-set": 1,
        "fresh-candle": 1,
        "fresh-hand-cream": 3,
        "fresh-eau-de-parfum": 1,
    }

    with pytest.raises(InvalidInput) as error:
        order(catalog, [{**GIFT, "quantity": 8}, {"productId": "fresh-hand-cream", "quantity": 8}])
    assert error.value.code == "OUT_OF_STOCK"


def test_order_totals_and_coupon(catalog):
    small = order(catalog, [{"productId": "fresh-hand-cream", "quantity": 1}])
    assert (small.items_amount, small.shipping_fee, small.total) == (28_000, 3_000, 31_000)

    with_coupon = order(
        catalog,
        [{"productId": "fresh-hand-cream", "quantity": 1}],
        use_coupon=True,
        coupon_available=True,
    )
    assert (with_coupon.shipping_fee, with_coupon.total) == (0, 28_000)

    with pytest.raises(InvalidInput) as error:
        order(catalog, [{"productId": "fresh-hand-cream", "quantity": 1}], use_coupon=True)
    assert error.value.code == "COUPON_UNAVAILABLE"


@pytest.mark.parametrize(
    ("kwargs", "code"),
    [
        ({"recipient": "  "}, "RECIPIENT_REQUIRED"),
        ({"recipient": "가" * 101}, "RECIPIENT_REQUIRED"),
        ({"address": ""}, "ADDRESS_REQUIRED"),
        ({"address": "가" * 501}, "ADDRESS_REQUIRED"),
    ],
)
def test_shipping_details_are_required(catalog, kwargs, code):
    with pytest.raises(InvalidInput) as error:
        order(catalog, [{"productId": "fresh-hand-cream", "quantity": 1}], **kwargs)

    assert error.value.code == code


@pytest.mark.parametrize("items", [[], None, {"productId": "fresh-hand-cream"}])
def test_order_needs_items(catalog, items):
    with pytest.raises(InvalidInput) as error:
        order(catalog, items)

    assert error.value.code == "ITEMS_REQUIRED"
