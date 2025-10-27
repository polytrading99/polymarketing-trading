# backend/core/bot_manager.py
import asyncio
from typing import Dict
from decimal import Decimal

from db import SessionLocal
from models import PnLTicks, Market
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from polymarket_client import get_midprice

class BotManager:
    def __init__(self):
        self.tasks: Dict[int, asyncio.Task] = {}

    async def _run_market_loop(self, market_id: int):
        """
        Paper-trading loop:
        - Pull midprice for the market's external_id
        - Compute a simple PnL change as if we held a small position
        - Persist ticks for the UI
        """
        position_size = Decimal("10")  # virtual exposure for paper PnL
        prev_price: Decimal | None = None
        pnl: Decimal = Decimal("0")

        try:
            while True:
                async with SessionLocal() as s:  # type: AsyncSession
                    # fetch market to get external_id
                    res = await s.execute(select(Market).where(Market.id == market_id))
                    m = res.scalar_one_or_none()
                    if not m:
                        await asyncio.sleep(1)
                        continue

                    mid = await get_midprice(m.external_id)
                    price = Decimal(str(mid))

                    if prev_price is not None:
                        # super simple paper PnL: (price change) * position
                        pnl += (price - prev_price) * position_size

                    # write tick
                    s.add(PnLTicks(market_id=market_id, pnl=pnl, inventory=Decimal("0")))
                    await s.commit()

                    prev_price = price

                # keep loop fairly tight but not noisy
                await asyncio.sleep(1.0)

        except asyncio.CancelledError:
            # clean shutdown (flush/cancel if needed)
            raise

    async def start_market_loop(self, market_id: int):
        if market_id in self.tasks and not self.tasks[market_id].done():
            return
        self.tasks[market_id] = asyncio.create_task(self._run_market_loop(market_id))

    async def stop_market_loop(self, market_id: int):
        t = self.tasks.get(market_id)
        if t and not t.done():
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass
            del self.tasks[market_id]

bot_manager = BotManager()
