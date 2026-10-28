"""Expiry CLI policy without database access or scheduler activation."""

import pytest

from aura_api.config import Settings
from aura_api.infra import expire_unpaid_orders as cli


@pytest.fixture
def calls(monkeypatch):
    calls = []
    monkeypatch.setattr(
        cli,
        "Settings",
        lambda: Settings(_env_file=None, database_url="postgresql://test@127.0.0.1:1/unused"),
    )

    async def run(url, ttl, limit, execute):
        calls.append((ttl, limit, execute))
        return {"due": 0, "cancelled": 0, "skipped": 0}

    monkeypatch.setattr(cli, "run", run)
    return calls


@pytest.mark.parametrize(
    "arguments,expected", [([], (10, 100, False)), (["--execute"], (10, 100, True))]
)
def test_cli_uses_ten_minutes_and_requires_explicit_execute(
    monkeypatch, calls, arguments, expected
):
    monkeypatch.setattr("sys.argv", ["expire", *arguments])
    cli.main()
    assert calls == [expected]


@pytest.mark.parametrize("ttl", ["0", "-1"])
def test_cli_rejects_nonpositive_explicit_ttl(monkeypatch, calls, ttl):
    monkeypatch.setattr("sys.argv", ["expire", "--ttl-minutes", ttl])
    with pytest.raises(SystemExit, match="positive"):
        cli.main()
    assert calls == []
