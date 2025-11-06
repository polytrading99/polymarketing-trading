from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from eth_account import Account
from eth_account.messages import encode_defunct
import secrets

from db import get_session
from models import WalletAuth
from auth_utils import create_jwt, verify_jwt


router = APIRouter()


class NonceRequest(BaseModel):
    address: str


class VerifyRequest(BaseModel):
    address: str
    signature: str


def _normalize_address(addr: str) -> str:
    if not isinstance(addr, str) or not addr.startswith("0x"):
        raise HTTPException(400, "invalid address")
    return addr.lower()


@router.post("/auth/nonce")
async def get_nonce(body: NonceRequest, session: AsyncSession = Depends(get_session)):
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
        await s.commit()
    message = f"Sign this message to authenticate: {nonce}"
    return {"address": address, "nonce": nonce, "message": message}


@router.post("/auth/verify")
async def verify_signature(body: VerifyRequest, session: AsyncSession = Depends(get_session)):
    address = _normalize_address(body.address)
    async with session as s:
        res = await s.execute(select(WalletAuth).where(WalletAuth.address == address))
        wa = res.scalar_one_or_none()
        if not wa:
            raise HTTPException(400, "no nonce for address")

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


