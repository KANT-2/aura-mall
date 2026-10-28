"""Partner domain: brand inquiry input rules."""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta

from aura_api.domain.errors import InvalidInput

EMAIL_PATTERN = re.compile(r"^\S+@\S+\.\S+$")
TEXT_MAX = 3000
# Limits follow the ERD columns; the form's own maxlength is the same or smaller.
FIELD_MAX = {"brand": 100, "name": 50, "email": 254, "type": 30}
INQUIRY_RATE_LIMIT = 3
INQUIRY_RATE_WINDOW = timedelta(minutes=10)
REQUIRED = ("brand", "name", "email", "introduction", "message", "type")
WEBSITE_MAX = 255
TYPES = frozenset({"향수", "바디 · 헤어", "홈 프래그런스", "기타 향 제품"})


@dataclass(frozen=True)
class PartnerInquiry:
    brand: str
    name: str
    email: str
    introduction: str
    message: str
    type: str
    website: str | None


def validate_inquiry(raw: object) -> PartnerInquiry:
    if not isinstance(raw, Mapping):
        raise InvalidInput("INQUIRY_INVALID", "필수 입력 항목을 확인해 주세요.")
    values: dict[str, str] = {}
    for field in REQUIRED:
        value = raw.get(field)
        limit = FIELD_MAX.get(field, TEXT_MAX)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise InvalidInput("INQUIRY_INVALID", "필수 입력 항목을 확인해 주세요.")
        values[field] = value.strip()
    # The form posts the checkbox value "on" for consent.
    if not EMAIL_PATTERN.match(values["email"]) or raw.get("consent") != "on":
        raise InvalidInput("INQUIRY_CONSENT", "필수 입력 항목과 동의를 확인해 주세요.")
    if values["type"] not in TYPES:
        raise InvalidInput("INQUIRY_INVALID", "필수 입력 항목을 확인해 주세요.")
    website = raw.get("website")
    if website is not None and (not isinstance(website, str) or len(website) > WEBSITE_MAX):
        raise InvalidInput("INQUIRY_INVALID", "필수 입력 항목을 확인해 주세요.")
    return PartnerInquiry(
        brand=values["brand"],
        name=values["name"],
        email=values["email"],
        introduction=values["introduction"],
        message=values["message"],
        type=values["type"],
        website=(website or "").strip() or None,
    )
