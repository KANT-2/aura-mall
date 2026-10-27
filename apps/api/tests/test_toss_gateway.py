"""Toss Payments client and payment rules without network access."""

import base64
import io
import json
import urllib.error

import anyio
import pytest
from pydantic import ValidationError

from aura_api.config import Settings
from aura_api.domain.errors import InvalidInput
from aura_api.domain.payments import confirm_input, ensure_amount, order_name, pg_order_id
from aura_api.infra.payment_gateway import GatewayUnavailable, TossPaymentsGateway

SECRET = "test_sk_FAKE0000000000000000aura"
DONE = {
    "paymentKey": "tgen_20261027abc",
    "orderId": "aura-0123456789abcdef0123456789abcdef",
    "status": "DONE",
    "totalAmount": 31000,
    "method": "카드",
    "approvedAt": "2026-10-27T18:00:00+09:00",
}


class FakeResponse(io.BytesIO):
    def __init__(self, status, body):
        super().__init__(json.dumps(body).encode())
        self.status = status


@pytest.fixture
def sent(monkeypatch):
    """Capture requests and answer from a queue of (status | exception, body)."""
    requests, answers = [], []

    def urlopen(request, timeout):
        requests.append(request)
        status, body = answers.pop(0)
        if isinstance(status, BaseException):
            raise status
        if status >= 400:
            raise urllib.error.HTTPError(
                request.full_url, status, "error", {}, io.BytesIO(json.dumps(body).encode())
            )
        return FakeResponse(status, body)

    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    return requests, answers


def gateway():
    return TossPaymentsGateway(SECRET, "https://api.tosspayments.com", 5)


def confirm(**overrides):
    values = {
        "payment_key": DONE["paymentKey"],
        "order_id": DONE["orderId"],
        "amount": 31000,
        "idempotency_key": "4f1c0a2e-0000-4000-8000-000000000001",
    } | overrides
    return anyio.run(lambda: gateway().confirm(**values))


def test_confirm_request_matches_the_toss_contract(sent):
    requests, answers = sent
    answers.append((200, DONE))
    result = confirm()
    [request] = requests
    assert request.full_url == "https://api.tosspayments.com/v1/payments/confirm"
    assert request.get_method() == "POST"
    assert (
        request.get_header("Authorization")
        == "Basic " + base64.b64encode((SECRET + ":").encode()).decode()
    )
    assert request.get_header("Idempotency-key") == "4f1c0a2e-0000-4000-8000-000000000001"
    assert json.loads(request.data) == {
        "paymentKey": DONE["paymentKey"],
        "orderId": DONE["orderId"],
        "amount": 31000,
    }
    assert (result.outcome, result.amount, result.method) == ("approved", 31000, "카드")
    assert result.approved_at.isoformat() == "2026-10-27T18:00:00+09:00"


@pytest.mark.parametrize(
    "status,code",
    [
        (403, "REJECT_CARD_PAYMENT"),
        (404, "NOT_FOUND_PAYMENT_SESSION"),
        (400, "INVALID_CARD_NUMBER"),
    ],
)
def test_definite_rejections_fail(sent, status, code):
    sent[1].append((status, {"code": code, "message": "거절"}))
    result = confirm()
    assert (result.outcome, result.code, result.message) == ("failed", code, "거절")


@pytest.mark.parametrize(
    "answer",
    [
        (500, {"code": "FAILED_INTERNAL_SYSTEM_PROCESSING", "message": "x"}),
        (409, {"code": "IDEMPOTENT_REQUEST_PROCESSING", "message": "x"}),
        (400, {"code": "PROVIDER_ERROR", "message": "x"}),
        (400, {"code": "ALREADY_PROCESSING_REQUEST", "message": "x"}),
        (502, {}),
        (TimeoutError("timed out"), None),
        (urllib.error.URLError("reset"), None),
    ],
)
def test_unknown_results_are_never_reported_as_failed(sent, answer):
    sent[1].append(answer)
    with pytest.raises(GatewayUnavailable):
        confirm()


def test_already_processed_reads_the_payment(sent):
    requests, answers = sent
    answers.extend([(400, {"code": "ALREADY_PROCESSED_PAYMENT", "message": "x"}), (200, DONE)])
    assert confirm().outcome == "approved"
    assert requests[1].full_url.endswith("/v1/payments/" + DONE["paymentKey"])
    assert requests[1].get_method() == "GET"


@pytest.mark.parametrize(
    "status,outcome,canceled",
    [
        ("READY", "pending", False),
        ("IN_PROGRESS", "pending", False),
        ("WAITING_FOR_DEPOSIT", "pending", False),
        ("ABORTED", "failed", False),
        ("EXPIRED", "failed", False),
        ("CANCELED", "failed", True),
    ],
)
def test_payment_statuses(sent, status, outcome, canceled):
    sent[1].append((200, DONE | {"status": status, "approvedAt": None}))
    result = confirm()
    assert (result.outcome, result.canceled) == (outcome, canceled)


def test_secret_key_never_appears_in_repr_or_errors(sent):
    sent[1].append((TimeoutError("timed out"), None))
    with pytest.raises(GatewayUnavailable) as error:
        confirm()
    assert SECRET not in repr(gateway()) and SECRET not in str(error.value)
    encoded = base64.b64encode((SECRET + ":").encode()).decode()
    assert encoded not in repr(gateway())


def toss_settings(**values):
    return Settings(_env_file=None, payment_provider="toss", **values)


def test_only_test_keys_are_accepted():
    assert toss_settings(toss_secret_key=SECRET).payment_provider == "toss"
    assert toss_settings(toss_secret_key="test_gsk_FAKE000000000000aura")
    for key in ("live_sk_FAKE0000000000aura", "live_gsk_FAKE00000000aura", "sk_abcdefghijkl", ""):
        with pytest.raises(ValidationError) as error:
            toss_settings(toss_secret_key=key)
        assert key not in str(error.value) or not key
    with pytest.raises(ValidationError):
        toss_settings(toss_secret_key=SECRET, toss_api_url="http://api.tosspayments.com")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, toss_secret_key=SECRET)  # a key without a provider
    assert Settings(_env_file=None).payment_provider is None


@pytest.mark.parametrize(
    "key,order,amount,code",
    [
        ("", "aura-abcdef", 1, "PAYMENT_KEY_INVALID"),
        ("x" * 201, "aura-abcdef", 1, "PAYMENT_KEY_INVALID"),
        ("pk/1", "aura-abcdef", 1, "PAYMENT_KEY_INVALID"),
        ("pk_1", "abc", 1, "PAYMENT_ORDER_INVALID"),
        ("pk_1", "aura abcdef", 1, "PAYMENT_ORDER_INVALID"),
        ("pk_1", "aura-abcdef", 0, "PAYMENT_AMOUNT_INVALID"),
        ("pk_1", "aura-abcdef", "1", "PAYMENT_AMOUNT_INVALID"),
        ("pk_1", "aura-abcdef", True, "PAYMENT_AMOUNT_INVALID"),
        ("pk_1", "aura-abcdef", 1.0, "PAYMENT_AMOUNT_INVALID"),
    ],
)
def test_confirm_input_rules(key, order, amount, code):
    with pytest.raises(InvalidInput) as error:
        confirm_input(key, order, amount)
    assert error.value.code == code


def test_amount_and_names():
    assert confirm_input("pk_1", "aura-abcdef", 31000) == ("pk_1", "aura-abcdef", 31000)
    ensure_amount(31000, 31000)
    with pytest.raises(InvalidInput):
        ensure_amount(31000, 30999)
    assert pg_order_id("0" * 32) == "aura-" + "0" * 32
    assert order_name("핸드크림", 1) == "핸드크림"
    assert order_name("핸드크림", 3) == "핸드크림 외 2건"
    assert len(order_name("x" * 150, 1)) == 100


CANCELED = DONE | {
    "status": "CANCELED",
    "cancels": [
        {
            "cancelAmount": 31000,
            "cancelReason": "member request",
            "canceledAt": "2026-10-27T19:00:00+09:00",
            "transactionKey": "TXKEY0001",
            "cancelStatus": "DONE",
        }
    ],
}


def cancel(amount=31000, **overrides):
    values = {
        "payment_key": DONE["paymentKey"],
        "amount": amount,
        "reason": "member request",
        "idempotency_key": "7a1c0a2e-0000-4000-8000-000000000002",
    } | overrides
    return anyio.run(lambda: gateway().cancel(**values))


def test_cancel_request_matches_the_toss_contract(sent):
    requests, answers = sent
    answers.append((200, CANCELED))
    result = cancel()
    [request] = requests
    assert request.full_url == (
        "https://api.tosspayments.com/v1/payments/" + DONE["paymentKey"] + "/cancel"
    )
    assert request.get_method() == "POST"
    assert (
        request.get_header("Authorization")
        == "Basic " + base64.b64encode((SECRET + ":").encode()).decode()
    )
    assert request.get_header("Idempotency-key") == "7a1c0a2e-0000-4000-8000-000000000002"
    # A full refund names no amount: the PG cancels the whole balance.
    assert json.loads(request.data) == {"cancelReason": "member request"}
    assert (result.outcome, result.amount, result.transaction_key) == (
        "refunded",
        31000,
        "TXKEY0001",
    )
    assert result.refunded_at.isoformat() == "2026-10-27T19:00:00+09:00"


def test_cancel_path_quotes_the_payment_key(sent):
    sent[1].append((200, CANCELED))
    cancel(payment_key="a/b c")
    assert sent[0][0].full_url.endswith("/v1/payments/a%2Fb%20c/cancel")


@pytest.mark.parametrize(
    "body",
    [
        CANCELED | {"status": "PARTIAL_CANCELED"},
        CANCELED | {"cancels": [CANCELED["cancels"][0] | {"cancelAmount": 1000}]},
        CANCELED | {"cancels": []},
        CANCELED | {"cancels": [CANCELED["cancels"][0] | {"cancelStatus": "IN_PROGRESS"}]},
    ],
)
def test_a_refund_that_is_not_exactly_the_full_amount_needs_review(sent, body):
    sent[1].append((200, body))
    result = cancel()
    assert result.outcome == "pending" and result.code == "REFUND_AMOUNT_MISMATCH"


def test_payment_still_approved_is_not_a_refund(sent):
    sent[1].append((200, DONE))
    assert cancel().outcome == "pending"


def test_already_canceled_reads_the_recorded_cancellation(sent):
    requests, answers = sent
    answers.extend([(400, {"code": "ALREADY_CANCELED_PAYMENT", "message": "x"}), (200, CANCELED)])
    result = cancel()
    assert (result.outcome, result.transaction_key) == ("refunded", "TXKEY0001")
    assert requests[1].get_method() == "GET"
    assert requests[1].full_url.endswith("/v1/payments/" + DONE["paymentKey"])


def test_already_canceled_with_another_amount_needs_review(sent):
    sent[1].extend([(400, {"code": "ALREADY_CANCELED_PAYMENT"}), (200, CANCELED)])
    assert cancel(amount=20000).code == "REFUND_AMOUNT_MISMATCH"


@pytest.mark.parametrize(
    "status,code",
    [
        (400, "NOT_CANCELABLE_PAYMENT"),
        (404, "NOT_FOUND_PAYMENT"),
        (400, "INVALID_REFUND_ACCOUNT_INFO"),
        (401, "UNAUTHORIZED_KEY"),
    ],
)
def test_definite_cancel_rejections_fail(sent, status, code):
    sent[1].append((status, {"code": code, "message": "거절"}))
    result = cancel()
    assert (result.outcome, result.code, result.message) == ("failed", code, "거절")


@pytest.mark.parametrize(
    "answers",
    [
        [(500, {"code": "FAILED_INTERNAL_SYSTEM_PROCESSING", "message": "x"})],
        [(409, {"code": "IDEMPOTENT_REQUEST_PROCESSING", "message": "x"})],
        [(400, {"code": "PROVIDER_ERROR", "message": "x"})],
        [(400, {"code": "ALREADY_PROCESSING_REQUEST", "message": "x"})],
        [(502, {})],
        [(TimeoutError("timed out"), None)],
        [(urllib.error.URLError("reset"), None)],
        [(400, {"code": "ALREADY_CANCELED_PAYMENT"}), (500, {})],
        [(200, CANCELED | {"status": "SOMETHING_NEW"})],
    ],
)
def test_unknown_cancel_results_are_never_reported_as_failed(sent, answers):
    sent[1].extend(answers)
    with pytest.raises(GatewayUnavailable):
        cancel()
