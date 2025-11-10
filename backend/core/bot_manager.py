import asyncio
import logging
import random
import time
from decimal import Decimal
from typing import Dict, Optional

from prometheus_client import Counter, Gauge, Histogram
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import SessionLocal
from models import Market, PnLTicks
from polymarket_client import fetch_market_snapshot
from settings import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()


LOOP_DURATION = Histogram(
    "bot_loop_duration_seconds",
    "Runtime of each bot loop iteration",
    ["market_id"],
)
LOOP_SUCCESS = Counter(
    "bot_loop_success_total",
    "Number of successful bot loop iterations",
    ["market_id"],
)
LOOP_ERRORS = Counter(
    "bot_loop_error_total",
    "Number of bot loop failures",
    ["market_id"],
)
MIDPRICE_GAUGE = Gauge(
    "bot_market_mid_price",
    "Latest observed mid price per market",
    ["market_id"],
)
LIQUIDITY_GAUGE = Gauge(
    "bot_market_liquidity",
    "Reported liquidity metric per market",
    ["market_id"],
)
PNL_GAUGE = Gauge(
    "bot_market_pnl",
    "Virtual PnL tracked by the paper trader",
    ["market_id"],
)


class BotManager:
    def __init__(self) -> None:
        self.tasks: Dict[int, asyncio.Task] = {}

    async def _fetch_market(self, session: AsyncSession, market_id: int) -> Optional[Market]:
        res = await session.execute(select(Market).where(Market.id == market_id))
        return res.scalar_one_or_none()

    async def _run_market_loop(self, market_id: int) -> None:
        position_size = Decimal(str(settings.bot_quote_size))
        prev_price: Optional[Decimal] = None
        pnl: Decimal = Decimal("0")
        inventory: Decimal = Decimal("0")

        backoff = settings.bot_loop_interval_seconds

        labels = {"market_id": str(market_id)}

        try:
            while True:
                loop_started = time.perf_counter()
                try:
                    async with SessionLocal() as session:  # type: AsyncSession
                        market = await self._fetch_market(session, market_id)
                        if not market:
                            logger.warning("Bot loop for market %s stopped: market not found", market_id)
                            return

                        snapshot = await fetch_market_snapshot(market.external_id)
                        price = Decimal(str(snapshot["mid_price"]))

                        if prev_price is not None:
                            pnl += (price - prev_price) * position_size

                        session.add(
                            PnLTicks(
                                market_id=market_id,
                                pnl=pnl,
                                inventory=inventory,
                            )
                        )
                        await session.commit()

                        prev_price = price
                        backoff = settings.bot_loop_interval_seconds

                        LOOP_SUCCESS.labels(**labels).inc()
                        MIDPRICE_GAUGE.labels(**labels).set(float(price))
                        PNL_GAUGE.labels(**labels).set(float(pnl))
                        liquidity = snapshot.get("liquidity")
                        if isinstance(liquidity, (int, float)):
                            LIQUIDITY_GAUGE.labels(**labels).set(float(liquidity))

                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # pragma: no cover - error path exercised in integration
                    LOOP_ERRORS.labels(**labels).inc()
                    logger.exception("Bot loop error for market %s: %s", market_id, exc)
                    backoff = min(
                        backoff * settings.bot_retry_backoff_seconds,
                        settings.bot_max_backoff_seconds,
                    )
                finally:
                    LOOP_DURATION.labels(**labels).observe(time.perf_counter() - loop_started)

                jitter = random.uniform(0, max(0.05, backoff * 0.1))
                await asyncio.sleep(backoff + jitter)

        except asyncio.CancelledError:
            raise

    async def start_market_loop(self, market_id: int) -> None:
        existing = self.tasks.get(market_id)
        if existing and not existing.done():
            return
        task = asyncio.create_task(self._run_market_loop(market_id))
        self.tasks[market_id] = task

    async def stop_market_loop(self, market_id: int) -> None:
        task = self.tasks.get(market_id)
        if not task:
            return
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self.tasks.pop(market_id, None)

    async def stop_all(self) -> None:
        await asyncio.gather(*(self.stop_market_loop(mid) for mid in list(self.tasks)))


bot_manager = BotManager()
