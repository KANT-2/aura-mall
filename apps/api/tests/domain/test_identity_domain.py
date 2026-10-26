import pytest

from aura_api.modules.errors import Conflict, InvalidInput
from aura_api.modules.identity.domain import (
    Coupon,
    SessionOwner,
    has_usable_coupon,
    validate_credentials,
    validate_registration,
)


def test_registration_normalizes_name_and_email():
    reg = validate_registration("  김철수 ", " Kim@AURA.com ", "password1", True)

    assert (reg.name, reg.email, reg.marketing) == ("김철수", "kim@aura.com", True)


@pytest.mark.parametrize(
    ("name", "email", "password", "code"),
    [
        ("", "kim@aura.com", "password1", "NAME_INVALID"),
        ("가" * 101, "kim@aura.com", "password1", "NAME_INVALID"),
        ("김철수", "", "password1", "EMAIL_INVALID"),
        ("김철수", "kim@aura.com", "x" * 257, "PASSWORD_INVALID"),
        ("김철수", "not-an-email", "password1", "MEMBER_INVALID"),
        ("김철수", "kim@aura.com", "short", "MEMBER_INVALID"),
    ],
)
def test_registration_rejects_invalid_input(name, email, password, code):
    with pytest.raises(InvalidInput) as error:
        validate_registration(name, email, password)

    assert error.value.code == code


def test_marketing_is_opt_in_only():
    assert validate_registration("김철수", "kim@aura.com", "password1", "yes").marketing is False


def test_credentials_require_password():
    assert validate_credentials(" Kim@aura.com", "pw").email == "kim@aura.com"
    with pytest.raises(InvalidInput):
        validate_credentials("kim@aura.com", "")


def test_session_owner_key_and_expected_owner():
    guest = SessionOwner(guest_id="g-1")
    member = SessionOwner(guest_id="g-1", user_id="u-1")

    assert guest.key == "guest:g-1"
    assert member.key == "member:u-1"
    member.ensure_expected(None)
    member.ensure_expected("u-1")
    with pytest.raises(Conflict):
        member.ensure_expected("g-1")


def test_coupon_can_be_used_once_and_restored():
    coupon = Coupon("c-1", "FREE_SHIPPING", "AVAILABLE")
    used = coupon.use()

    assert used.status == "USED"
    assert not has_usable_coupon([used])
    with pytest.raises(InvalidInput):
        used.use()
    assert used.restore().usable
