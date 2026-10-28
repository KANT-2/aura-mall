"""Identity domain: signup/login input rules, request owner, shipping coupon.

Authentication uses a signed Access JWT in the Bearer header. The BFF stores tokens
in HttpOnly cookies; guest IDs never authenticate users. There is no server session.
"""

import re
from dataclasses import dataclass, replace
from typing import Literal

from aura_api.domain.errors import Conflict, InvalidInput

# Same email shape the signup form and Mock API accept.
EMAIL_PATTERN = re.compile(r"^\S+@\S+\.\S+$")
NAME_MAX = 100
EMAIL_MAX = 254
PASSWORD_MIN = 8
PASSWORD_MAX = 256

FREE_SHIPPING = "FREE_SHIPPING"
CouponStatus = Literal["AVAILABLE", "USED"]


@dataclass(frozen=True)
class Registration:
    name: str
    email: str
    password: str
    marketing: bool


@dataclass(frozen=True)
class Credentials:
    email: str
    password: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_name(name: object) -> str:
    if not isinstance(name, str) or not name.strip() or len(name) > NAME_MAX:
        raise InvalidInput("NAME_INVALID", "이름을 입력해 주세요.")
    return name.strip()


def validate_registration(
    name: object, email: object, password: object, marketing: object = False
) -> Registration:
    name = validate_name(name)
    if not isinstance(email, str) or not email.strip() or len(email) > EMAIL_MAX:
        raise InvalidInput("EMAIL_INVALID", "이메일을 확인해 주세요.")
    if not isinstance(password, str) or len(password) > PASSWORD_MAX:
        raise InvalidInput("PASSWORD_INVALID", "비밀번호를 확인해 주세요.")
    normalized = normalize_email(email)
    if not EMAIL_PATTERN.match(normalized) or len(password) < PASSWORD_MIN:
        raise InvalidInput("MEMBER_INVALID", "회원 정보를 확인해 주세요.")
    return Registration(name.strip(), normalized, password, marketing is True)


def validate_credentials(email: object, password: object) -> Credentials:
    if not isinstance(email, str) or not email.strip() or len(email) > EMAIL_MAX:
        raise InvalidInput("EMAIL_INVALID", "이메일을 확인해 주세요.")
    if not isinstance(password, str) or not password or len(password) > PASSWORD_MAX:
        raise InvalidInput("PASSWORD_REQUIRED", "비밀번호를 입력해 주세요.")
    return Credentials(normalize_email(email), password)


@dataclass(frozen=True)
class RequestOwner:
    """Who a request acts for: a member, or an anonymous visitor kept across login/logout."""

    guest_id: str
    user_id: str | None = None

    @property
    def key(self) -> str:
        return f"member:{self.user_id}" if self.user_id else f"guest:{self.guest_id}"

    @property
    def raw_id(self) -> str:
        # Value the web client sends back in X-Account-Owner.
        return self.user_id or self.guest_id

    def ensure_expected(self, expected: str | None) -> None:
        """Reject a request started under another account (X-Account-Owner mismatch)."""
        if expected and expected != self.raw_id:
            raise Conflict("OWNER_CHANGED", "계정이 변경되었어요. 다시 시도해 주세요.")


@dataclass(frozen=True)
class Coupon:
    id: str
    type: str
    status: CouponStatus

    @property
    def usable(self) -> bool:
        return self.status == "AVAILABLE"

    def use(self) -> "Coupon":
        if not self.usable:
            raise InvalidInput("COUPON_UNAVAILABLE", "사용할 수 없는 쿠폰이에요.")
        return replace(self, status="USED")

    def restore(self) -> "Coupon":
        return replace(self, status="AVAILABLE")


def has_usable_coupon(coupons: list[Coupon]) -> bool:
    """`Member.coupon` is derived from the coupon box, never stored."""
    return any(coupon.usable for coupon in coupons)
