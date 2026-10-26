import pytest

from aura_api.domain.errors import InvalidInput
from aura_api.domain.partner import validate_inquiry

VALID = {
    "brand": " AURA Lab ",
    "name": "김담당",
    "email": "brand@example.com",
    "introduction": "향을 만드는 브랜드입니다.",
    "message": "입점 문의드립니다.",
    "type": "향수",
    "consent": "on",
}


def test_valid_inquiry_is_trimmed():
    inquiry = validate_inquiry({**VALID, "website": " https://example.com "})

    assert inquiry.brand == "AURA Lab"
    assert inquiry.website == "https://example.com"


def test_website_is_optional():
    assert validate_inquiry(VALID).website is None
    assert validate_inquiry({**VALID, "website": "  "}).website is None


@pytest.mark.parametrize(
    "change",
    [
        {"brand": ""},
        {"brand": "가" * 101},
        {"name": "가" * 51},
        {"message": "가" * 3001},
        {"type": "식품"},
        {"website": "a" * 256},
        {"introduction": None},
    ],
)
def test_invalid_fields_are_rejected(change):
    with pytest.raises(InvalidInput) as error:
        validate_inquiry({**VALID, **change})

    assert error.value.code == "INQUIRY_INVALID"


@pytest.mark.parametrize(
    "change", [{"email": "not-an-email"}, {"consent": True}, {"consent": None}]
)
def test_email_and_consent_are_checked(change):
    with pytest.raises(InvalidInput) as error:
        validate_inquiry({**VALID, **change})

    assert error.value.code == "INQUIRY_CONSENT"
