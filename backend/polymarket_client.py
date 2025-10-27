# backend/polymarket_client.py
import math
import random
import time
import httpx
from typing import Optional

# NOTE:
# This implements two price feeds:
# 1) Polymarket public API (best-effort; endpoint/fields can change)
# 2) A safe local fallback ("demo" mode) if the API is unavailable

_POLYMARKETS_URL = "https://gamma-api.polymarket.com/markets?limit=50"

async def get_midprice_from_polymarket(external_id: str) -> Optional[float]:
    """
    Try to fetch a market midprice by an identifier you store in markets.external_id.
    This uses a broad endpoint and tries to match by fields like 'slug' or 'question'.
    If it can't find/parse, return None to trigger fallback.
    """
    timeout = httpx.Timeout(5.0, connect=3.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(_POLYMARKETS_URL)
        r.raise_for_status()
        data = r.json()

        # Try some common fields — adjust once you standardize your mapping.
        candidates = data if isinstance(data, list) else data.get("data") or []

        def norm(s: str) -> str:
            return (s or "").strip().lower()

        ext = norm(external_id)

        for m in candidates:
            slug = norm(m.get("slug", ""))
            question = norm(m.get("question", ""))
            ticker = norm(m.get("ticker", ""))

            if ext and (ext in slug or ext in question or ext == ticker):
                # Heuristics: try to compute a mid
                # Common shapes: yesPrice/noPrice OR bestBid/bestAsk OR bids/asks
                yes_price = m.get("yesPrice")
                no_price = m.get("noPrice")
                best_bid = m.get("bestBid")
                best_ask = m.get("bestAsk")

                vals = []
                for v in (yes_price, 1 - no_price if isinstance(no_price, (int, float)) else None,
                          best_bid, best_ask):
                    if isinstance(v, (int, float)):
                        vals.append(float(v))
                if vals:
                    # Use average of whatever we could parse
                    return sum(vals) / len(vals)

        return None

# ---- Fallback "demo" feed so the loop never blocks ----
def fallback_demo_midprice(external_id: str) -> float:
    # deterministic-ish price stream so charts look alive
    t = time.time()
    base = (hash(external_id) % 70) / 100.0 + 0.15  # 0.15 .. 0.85
    wiggle = 0.03 * math.sin(t / 7.0) + 0.01 * math.sin(t / 1.3)
    noise = random.uniform(-0.003, 0.003)
    p = max(0.01, min(0.99, base + wiggle + noise))
    return p

async def get_midprice(external_id: str) -> float:
    """
    Unified accessor: tries Polymarket first, then safe fallback.
    """
    try:
        mp = await get_midprice_from_polymarket(external_id)
        if mp is not None and 0.0 < mp < 1.0:
            return mp
    except Exception:
        # swallow; we'll fallback below
        pass
    return fallback_demo_midprice(external_id)
