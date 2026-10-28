"""30-day deletion grace period: restore by login, expiry and the purge job (real PostgreSQL)."""

import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from test_deactivation import (
    ALICE,
    BOB,
    ORIGIN,
    deactivate,
    expire_grace,
    login,
    pg_only,
    protected,
    purge,
    query,
    refresh,
)
from test_deactivation import business_sessions as business_sessions
from test_deactivation import client as client
from test_deactivation import repository as repository
from test_lifecycle import PASSWORD_HASH

from aura_api.identity import service as auth_service
from aura_api.infra.purge_members import purge_expired_members


@pytest.fixture
def pending(client, repository):
    """Alice with a recipe and an unused coupon, deactivated with all tokens revoked."""
    pg_only(repository)
    recipe, coupon = uuid4(), uuid4()
    query(
        repository,
        "INSERT INTO recipes(id,user_id,version,name,label,color) VALUES (%s,%s,"
        "1,'Private','classic','#ffffff')",
        (recipe, ALICE),
    )
    query(
        repository,
        "INSERT INTO user_coupons(id,user_id,type) VALUES (%s,%s,'FREE_SHIPPING')",
        (coupon, ALICE),
    )
    pair = login(client).json()
    assert deactivate(client, pair["accessToken"]).status_code == 204
    # Historical schedule fixture only: new permanent withdrawals have no purge deadline.
    query(
        repository,
        "UPDATE users SET deactivated_at=NULL, deletion_requested_at=now(), "
        "deletion_scheduled_at=now()+interval '30 days', password_hash=%s WHERE id=%s",
        (PASSWORD_HASH, ALICE),
    )
    return {"pair": pair, "recipe": recipe, "coupon": coupon}


def account(repository, user_id=ALICE):
    return query(
        repository,
        "SELECT is_active,deletion_requested_at IS NULL,deleted_at IS NULL FROM users WHERE id=%s",
        (user_id,),
    )[0]


def kept(repository, pending):
    return (
        query(repository, "SELECT id FROM recipes WHERE id=%s", (pending["recipe"],)),
        query(repository, "SELECT id FROM user_coupons WHERE id=%s", (pending["coupon"],)),
    )


def schedule_in(repository, seconds):
    query(
        repository,
        "UPDATE users SET deletion_scheduled_at=clock_timestamp()+%s*interval '1 second' "
        "WHERE id=%s",
        (seconds, ALICE),
    )


def test_pending_member_tokens_stay_blocked_and_data_is_kept(client, repository, pending):
    old = pending["pair"]
    assert protected(client, old["accessToken"]).status_code == 401
    assert refresh(client, old["refreshToken"]).status_code == 401
    recipes = client.get(
        "/api/v1/recipes",
        headers={"Origin": ORIGIN, "Authorization": "Bearer " + old["accessToken"]},
    )
    assert recipes.status_code == 401
    assert account(repository) == (False, False, True)
    assert kept(repository, pending) == ([(pending["recipe"],)], [(pending["coupon"],)])


def test_legacy_pending_account_cannot_restore_with_correct_password(client, repository, pending):
    assert login(client).status_code == 401
    assert account(repository) == (False, False, True)
    assert kept(repository, pending) == ([(pending["recipe"],)], [(pending["coupon"],)])
    assert protected(client, pending["pair"]["accessToken"]).status_code == 401
    assert refresh(client, pending["pair"]["refreshToken"]).status_code == 401


def test_wrong_password_inside_grace_does_not_restore(client, repository, pending):
    assert login(client, password="wrong-password-123").status_code == 401
    assert account(repository) == (False, False, True)


def test_expired_grace_cannot_restore(client, repository, pending):
    expire_grace(repository)
    response = login(client)
    assert response.status_code == 401
    assert response.json() == login(client, "missing@example.com").json()
    assert account(repository) == (False, False, True)


def test_repository_restore_boundary_is_fail_closed(client, repository, pending):
    tokens = client.app.state.auth_service._issue(ALICE, uuid4())
    assert (
        client.portal.call(
            lambda: repository.restore_token_family(
                tokens, expected_password_hash=PASSWORD_HASH, expected_deletion_requested_at=None
            )
        )
        is False
    )
    assert account(repository) == (False, False, True)
    assert protected(client, tokens.access_token).status_code == 401


def test_purge_during_password_verification_never_restores_account(
    client, repository, pending, monkeypatch
):
    checked, resume = threading.Event(), threading.Event()
    original = auth_service.check_password

    def paused(stored, password):
        valid = original(stored, password)
        checked.set()
        assert resume.wait(10)
        return valid

    monkeypatch.setattr(auth_service, "check_password", paused)
    expire_grace(repository)
    with ThreadPoolExecutor(max_workers=1) as pool:
        logging_in = pool.submit(login, client)
        assert checked.wait(10)
        try:
            assert purge(client, repository) is True
        finally:
            resume.set()
        assert logging_in.result(timeout=15).status_code == 401
    assert account(repository) == (False, False, False)
    assert kept(repository, pending) == ([], [])


def test_purge_anonymizes_only_due_members_and_is_idempotent(client, repository, pending):
    bob_pair = login(client, "bob@example.com").json()
    order = query(
        repository,
        "INSERT INTO orders(user_id,recipient,address,items_amount,shipping_fee,total) "
        "VALUES (%s,'Recipient','Retained address',100,0,100) RETURNING id",
        (ALICE,),
    )[0][0]
    login(client, password="wrong-password-123")
    assert query(repository, "SELECT count(*) FROM login_failures") == [(1,)]
    # Not due yet: the dry run and the real run leave the pending account alone.
    result = client.portal.call(lambda: purge_expired_members(repository, execute=True, limit=10))
    assert result["eligible"] == 0 and result["status"] == "succeeded"
    expire_grace(repository)
    dry = client.portal.call(lambda: purge_expired_members(repository, execute=False, limit=10))
    assert (dry["eligible"], dry["deleted"], dry["status"]) == (1, 0, "succeeded")
    assert account(repository) == (False, False, True)
    done = client.portal.call(lambda: purge_expired_members(repository, execute=True, limit=10))
    assert (done["eligible"], done["deleted"], done["failed"]) == (1, 1, 0)
    again = client.portal.call(lambda: purge_expired_members(repository, execute=True, limit=10))
    assert (again["eligible"], again["deleted"], again["status"]) == (0, 0, "succeeded")

    row = query(
        repository,
        "SELECT email,name,password_hash,marketing,is_active,deleted_at IS NOT NULL "
        "FROM users WHERE id=%s",
        (ALICE,),
    )[0]
    assert row == (f"deleted-{ALICE}@deleted.invalid", "탈퇴회원", "!deleted", False, False, True)
    assert kept(repository, pending) == ([], [])
    assert query(repository, "SELECT count(*) FROM login_failures") == [(0,)]
    assert query(repository, "SELECT address FROM orders WHERE id=%s", (order,)) == [
        ("Retained address",)
    ]
    assert login(client).status_code == 401
    assert protected(client, bob_pair["accessToken"]).status_code == 200
    assert account(repository, BOB) == (True, True, True)
    runs = query(
        repository,
        "SELECT dry_run,status,eligible,deleted,failed,finished_at IS NOT NULL "
        "FROM member_deletion_runs ORDER BY started_at",
    )
    assert runs == [
        (False, "succeeded", 0, 0, 0, True),
        (True, "succeeded", 1, 0, 0, True),
        (False, "succeeded", 1, 1, 0, True),
        (False, "succeeded", 0, 0, 0, True),
    ]


def test_failed_purge_rolls_back_member_and_records_the_run(client, repository, pending):
    expire_grace(repository)
    query(
        repository,
        "CREATE FUNCTION reject_recipe_delete() RETURNS trigger LANGUAGE plpgsql "
        "AS $$ BEGIN RAISE EXCEPTION 'private DB failure'; END $$",
    )
    query(
        repository,
        "CREATE TRIGGER fail_purge BEFORE DELETE ON recipes FOR EACH ROW "
        "EXECUTE FUNCTION reject_recipe_delete()",
    )
    result = client.portal.call(lambda: purge_expired_members(repository, execute=True, limit=10))
    assert (result["status"], result["deleted"], result["failed"]) == ("failed", 0, 1)
    assert account(repository) == (False, False, True)
    assert kept(repository, pending) == ([(pending["recipe"],)], [(pending["coupon"],)])
    assert query(repository, "SELECT email FROM users WHERE id=%s", (ALICE,)) == [
        ("alice@example.com",)
    ]
    assert query(repository, "SELECT status,failed,failed_user_ids FROM member_deletion_runs") == [
        ("failed", 1, [ALICE])
    ]


def test_admin_with_shared_uuid_is_never_purged(client, repository, pending):
    query(
        repository,
        "INSERT INTO admins(id,email,name,password_hash) VALUES (%s,'ops@example.com','Ops',%s)",
        (ALICE, "admin-hash"),
    )
    expire_grace(repository)
    assert purge(client, repository) is True
    assert query(repository, "SELECT email,status FROM admins WHERE id=%s", (ALICE,)) == [
        ("ops@example.com", "active")
    ]
