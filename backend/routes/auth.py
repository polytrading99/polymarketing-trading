import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional

from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from db import get_session
from models import WalletAuth
from auth_utils import create_jwt, verify_jwt
from settings import get_settings


settings = get_settings()


router = APIRouter()


class NonceRequest(BaseModel):
    address: str


class VerifyRequest(BaseModel):
    address: str
    signature: str


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        if self.max_requests <= 0:
            return True
        now = time.monotonic()
        window = self._hits[key]
        while window and now - window[0] > self.window_seconds:
            window.popleft()
        if len(window) >= self.max_requests:
            return False
        window.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()


rate_limiter = SlidingWindowRateLimiter(
    max_requests=settings.auth_rate_limit_max_requests,
    window_seconds=settings.auth_rate_limit_window_seconds,
)


def _normalize_address(addr: str) -> str:
    if not isinstance(addr, str) or not addr.startswith("0x"):
        raise HTTPException(400, "invalid address")
    return addr.lower()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _with_timezone(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _is_nonce_expired(wa: WalletAuth) -> bool:
    ts = _with_timezone(wa.updated_at)
    if not ts:
        return False
    return _utcnow() - ts > timedelta(seconds=settings.nonce_ttl_seconds)


async def enforce_rate_limit(request: Request):
    client_host = request.client.host if request.client else "anonymous"
    key = f"{client_host}:{request.url.path}"
    if not rate_limiter.allow(key):
        raise HTTPException(429, "too many requests")


@router.post("/auth/nonce")
async def get_nonce(
    body: NonceRequest,
    request: Request,
    _: None = Depends(enforce_rate_limit),
    session: AsyncSession = Depends(get_session),
):
    address = _normalize_address(body.address)
    nonce = secrets.token_hex(16)
    async with session as s:
        existing = await s.execute(select(WalletAuth).where(WalletAuth.address == address))
        wa = existing.scalar_one_or_none()
        if wa:
            wa.nonce = nonce
        else:
            wa = WalletAuth(address=address, nonce=nonce)
            s.add(wa)
        wa.updated_at = _utcnow()
        await s.commit()
    message = f"Sign this message to authenticate: {nonce}"
    return {"address": address, "nonce": nonce, "message": message}


@router.post("/auth/verify")
async def verify_signature(
    body: VerifyRequest,
    request: Request,
    _: None = Depends(enforce_rate_limit),
    session: AsyncSession = Depends(get_session),
):
    address = _normalize_address(body.address)
    async with session as s:
        res = await s.execute(select(WalletAuth).where(WalletAuth.address == address))
        wa = res.scalar_one_or_none()
        if not wa:
            raise HTTPException(400, "no nonce for address")

        if _is_nonce_expired(wa):
            wa.nonce = secrets.token_hex(16)
            wa.updated_at = _utcnow()
            await s.commit()
            raise HTTPException(400, "nonce expired; request a new one")

        message = f"Sign this message to authenticate: {wa.nonce}"
        msg = encode_defunct(text=message)
        try:
            recovered = Account.recover_message(msg, signature=body.signature)
        except Exception:
            raise HTTPException(400, "invalid signature")

        if recovered.lower() != address:
            raise HTTPException(400, "signature mismatch")

        # success -> rotate nonce to prevent replay
        wa.nonce = secrets.token_hex(16)
        wa.updated_at = _utcnow()
        await s.commit()

        token = create_jwt(address)
    return {"token": token, "address": address}


def get_current_address(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    token = authorization.split(" ", 1)[1]
    addr = verify_jwt(token)
    if not addr:
        raise HTTPException(401, "invalid token")
    return addr


