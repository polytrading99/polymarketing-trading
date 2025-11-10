# backend/polymarket_client.py
import logging
import math
import random
import time
from typing import Optional, Tuple, TypedDict

import httpx

from settings import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()


class MarketSnapshot(TypedDict, total=False):
    mid_price: float
    best_bid: Optional[float]
    best_ask: Optional[float]
    yes_price: Optional[float]
    no_price: Optional[float]
    liquidity: Optional[float]
    source: str


def _public_markets_url(limit: int = 50) -> str:
    base = settings.polymarket_public_api_base.rstrip("/")
    return f"{base}/markets?limit={limit}"


async def get_midprice_from_polymarket(external_id: str) -> Optional[float]:
    """
    Try to fetch a market midprice by an identifier you store in markets.external_id.
    This uses a broad endpoint and tries to match by fields like 'slug' or 'question'.
    If it can't find/parse, return None to trigger fallback.
    """
    timeout = httpx.Timeout(settings.polymarket_timeout_seconds, connect=3.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(_public_markets_url())
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


def _extract_best_prices(payload: dict) -> Tuple[Optional[float], Optional[float]]:
    bids = payload.get("bids") or payload.get("bestBids") or payload.get("bestBid")
    asks = payload.get("asks") or payload.get("bestAsks") or payload.get("bestAsk")

    def _top(price_level):
        if isinstance(price_level, (int, float)):
            return float(price_level)
        if isinstance(price_level, dict):
            for key in ("price", "p", "value"):
                if key in price_level and isinstance(price_level[key], (int, float)):
                    return float(price_level[key])
        if isinstance(price_level, list) and price_level:
            return _top(price_level[0])
        return None

    return _top(bids), _top(asks)


async def fetch_market_snapshot(external_id: str) -> MarketSnapshot:
    """
    Fetch richer market information (best bid/ask, liquidity) from Polymarket.
    Falls back to the broadcast midprice if the CLOB endpoint is unavailable.
    """
    timeout = httpx.Timeout(settings.polymarket_timeout_seconds, connect=3.0)
    headers = {}
    if settings.polymarket_api_key:
        headers["Authorization"] = f"Bearer {settings.polymarket_api_key}"

    errors: list[str] = []
    payload: dict = {}

    api_base = settings.polymarket_api_base.rstrip("/")
    candidates = [
        f"{api_base}/markets/{external_id}",
        f"{api_base}/markets-data/{external_id}",
        f"{settings.polymarket_public_api_base.rstrip('/')}/markets/{external_id}",
    ]

    async with httpx.AsyncClient(timeout=timeout) as client:
        for url in candidates:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 404:
                    errors.append(f"{url} -> 404")
                    continue
                resp.raise_for_status()
                payload = resp.json()
                payload["__source"] = url
                break
            except Exception as exc:  # pragma: no cover - best-effort logging
                errors.append(f"{url} -> {exc!r}")
                continue

    if errors:
        logger.debug("polymarket_client.fetch_market_snapshot errors: %s", errors)

    best_bid, best_ask = _extract_best_prices(payload)

    yes_price = payload.get("yesPrice") or payload.get("market", {}).get("yesPrice")
    no_price = payload.get("noPrice") or payload.get("market", {}).get("noPrice")
    mid = payload.get("midPrice") or payload.get("mid_price")

    if mid is None:
        try:
            mid = await get_midprice(external_id)
        except Exception:  # pragma: no cover
            mid = fallback_demo_midprice(external_id)

    liquidity = payload.get("liquidity") or payload.get("totalYesVolume")

    snapshot: MarketSnapshot = {
        "mid_price": float(mid),
        "best_bid": float(best_bid) if isinstance(best_bid, (int, float)) else None,
        "best_ask": float(best_ask) if isinstance(best_ask, (int, float)) else None,
        "yes_price": float(yes_price) if isinstance(yes_price, (int, float)) else None,
        "no_price": float(no_price) if isinstance(no_price, (int, float)) else None,
        "liquidity": float(liquidity) if isinstance(liquidity, (int, float)) else None,
        "source": payload.get("__source", "fallback"),
    }
    return snapshot
