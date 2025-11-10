import pytest

from main import app
from models import Market
from routes.auth import get_current_address


@pytest.mark.asyncio
async def test_create_market(client, session):
    payload = {
        "name": "Election",
        "external_id": "election",
        "base_spread_bps": 50,
        "enabled": True,
    }

    res = await client.post("/markets", json=payload)
    assert res.status_code == 200

    data = res.json()
    assert data["id"]
    assert data["external_id"] == payload["external_id"]

    stored = await session.get(Market, data["id"])
    assert stored is not None


@pytest.mark.asyncio
async def test_create_market_duplicate_external_id(client, session):
    session.add(Market(name="Existing", external_id="dup"))
    await session.commit()

    res = await client.post(
        "/markets",
        json={"name": "New", "external_id": "dup", "base_spread_bps": 10, "enabled": True},
    )

    assert res.status_code == 400


@pytest.mark.asyncio
async def test_list_markets(client, session):
    session.add(Market(name="A", external_id="a"))
    session.add(Market(name="B", external_id="b"))
    await session.commit()

    res = await client.get("/markets")

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_start_market_requires_auth(client, session):
    market = Market(name="Test", external_id="test")
    session.add(market)
    await session.commit()

    res = await client.post(f"/markets/{market.id}/start")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_start_market_triggers_bot_loop(client, session, monkeypatch):
    market = Market(name="Test", external_id="test")
    session.add(market)
    await session.commit()

    captured = {"called": False}

    async def fake_start(mid: int):
        captured["called"] = True
        assert mid == market.id

    monkeypatch.setattr("routes.markets.bot_manager.start_market_loop", fake_start)

    app.dependency_overrides[get_current_address] = lambda: "0xabc"
    try:
        res = await client.post(
            f"/markets/{market.id}/start",
            headers={"Authorization": "Bearer token"},
        )
    finally:
        app.dependency_overrides.pop(get_current_address, None)

    assert res.status_code == 200
    assert captured["called"]


@pytest.mark.asyncio
async def test_stop_market_triggers_bot_stop(client, monkeypatch):
    captured = {"called": False}

    async def fake_stop(mid: int):
        captured["called"] = True
        assert mid == 1

    monkeypatch.setattr("routes.markets.bot_manager.stop_market_loop", fake_stop)

    app.dependency_overrides[get_current_address] = lambda: "0xabc"
    try:
        res = await client.post(
            "/markets/1/stop",
            headers={"Authorization": "Bearer token"},
        )
    finally:
        app.dependency_overrides.pop(get_current_address, None)

    assert res.status_code == 200
    assert captured["called"]

