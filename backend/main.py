
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db import get_session, init_db
from models import Market, PnLTicks
from routes.markets import router as markets_router
import asyncio
import random

app = FastAPI(title="Polymarket Bot Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(markets_router, prefix="")

@app.on_event("startup")
async def startup():
    for attempt in range(15):
        try:
            await init_db()
            break
        except Exception:
            await asyncio.sleep(1)
    else:
        await init_db()

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/pnl/{market_id}")
async def get_pnl(
    market_id: int,
    session: AsyncSession = Depends(get_session),   # <-- add Depends here
):
    async with session as s:
        q = await s.execute(
            select(PnLTicks)
            .where(PnLTicks.market_id == market_id)
            .order_by(PnLTicks.ts.desc())
            .limit(1)
        )
        tick = q.scalar_one_or_none()
        if not tick:
            raise HTTPException(status_code=404, detail="No PnL yet")
        return {"market_id": market_id, "pnl": float(tick.pnl), "inventory": float(tick.inventory)}

@app.websocket("/ws/pnl")
async def ws_pnl(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            payload = {"type": "pnl_tick", "market_id": 1, "pnl": round(random.uniform(-5, 5), 4)}
            await ws.send_json(payload)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
