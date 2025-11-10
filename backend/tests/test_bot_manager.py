import asyncio

import pytest

from core.bot_manager import (
    LOOP_ERRORS,
    LOOP_SUCCESS,
    BotManager,
    settings as bot_settings,
)
from models import Market, PnLTicks


@pytest.mark.asyncio
async def test_bot_manager_persists_ticks(monkeypatch):
    market = Market(name="Loop", external_id="loop")
    market.id = 1

    snapshots = [
        {"mid_price": 0.5, "best_bid": 0.49, "best_ask": 0.51, "liquidity": 1000.0, "source": "test"},
        {"mid_price": 0.53, "best_bid": 0.52, "best_ask": 0.54, "liquidity": 1001.0, "source": "test"},
    ]
    recorded_ticks: list[PnLTicks] = []

    class DummyResult:
        def __init__(self, market_obj: Market):
            self._market = market_obj

        def scalar_one_or_none(self):
            return self._market

    class DummySession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def execute(self, _stmt):
            return DummyResult(market)

        def add(self, obj):
            recorded_ticks.append(obj)

        async def commit(self):
            return None

    async def fake_snapshot(_external_id: str):
        if snapshots:
            return snapshots.pop(0)
        return {"mid_price": 0.55, "best_bid": 0.54, "best_ask": 0.56, "liquidity": 1002.0, "source": "test"}

    original_sleep = asyncio.sleep

    async def fast_sleep(_delay: float):
        await original_sleep(0)

    labels = {"market_id": str(market.id)}
    success_before = LOOP_SUCCESS.labels(**labels)._value.get()
    errors_before = LOOP_ERRORS.labels(**labels)._value.get()

    monkeypatch.setattr("core.bot_manager.SessionLocal", lambda: DummySession(), raising=True)
    monkeypatch.setattr("core.bot_manager.fetch_market_snapshot", fake_snapshot, raising=True)
    monkeypatch.setattr("core.bot_manager.random.uniform", lambda _a, _b: 0, raising=True)
    monkeypatch.setattr("core.bot_manager.asyncio.sleep", fast_sleep, raising=True)
    monkeypatch.setattr(bot_settings, "bot_loop_interval_seconds", 0.01, raising=False)
    monkeypatch.setattr(bot_settings, "bot_retry_backoff_seconds", 1.0, raising=False)
    monkeypatch.setattr(bot_settings, "bot_max_backoff_seconds", 0.1, raising=False)

    manager = BotManager()
    await manager.start_market_loop(market.id)
    await asyncio.sleep(0.05)
    await manager.stop_market_loop(market.id)

    assert recorded_ticks
    assert all(isinstance(t, PnLTicks) for t in recorded_ticks)

    assert LOOP_SUCCESS.labels(**labels)._value.get() > success_before
    assert LOOP_ERRORS.labels(**labels)._value.get() == errors_before
