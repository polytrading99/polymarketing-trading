
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from db import get_session
from models import Market
from schemas import MarketCreate, MarketOut
from core.bot_manager import bot_manager

router = APIRouter()

@router.get("/markets", response_model=List[MarketOut])
async def list_markets(session: AsyncSession = Depends(get_session)):
    async with session as s:
        res = await s.execute(select(Market))
        rows = res.scalars().all()
        return rows

@router.post("/markets", response_model=MarketOut)
async def create_market(body: MarketCreate, session: AsyncSession = Depends(get_session)):
    async with session as s:
        exists = await s.execute(select(Market).where(Market.external_id == body.external_id))
        if exists.scalar_one_or_none():
            raise HTTPException(400, "external_id already exists")
        m = Market(
            name=body.name,
            external_id=body.external_id,
            base_spread_bps=body.base_spread_bps,
            enabled=body.enabled,
        )
        s.add(m)
        await s.commit()
        await s.refresh(m)
        return m

@router.post("/markets/{market_id}/start")
async def start_market(market_id: int, session: AsyncSession = Depends(get_session)):
    async with session as s:
        res = await s.execute(select(Market).where(Market.id == market_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(404, "market not found")
        await bot_manager.start_market_loop(market_id)
        return {"ok": True, "started": market_id}

@router.post("/markets/{market_id}/stop")
async def stop_market(market_id: int):
    await bot_manager.stop_market_loop(market_id)
    return {"ok": True, "stopped": market_id}
