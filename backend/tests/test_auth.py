import secrets
from datetime import datetime, timedelta, timezone

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from sqlalchemy import select

from models import WalletAuth
from settings import get_settings

settings = get_settings()


@pytest.mark.asyncio
async def test_nonce_creation(client, session):
    payload = {"address": "0x1234567890abcdef1234567890abcdef12345678"}

    res = await client.post("/auth/nonce", json=payload)

    assert res.status_code == 200
    data = res.json()
    assert data["nonce"]
    assert data["address"] == payload["address"].lower()

    stored = await session.execute(
        WalletAuth.__table__.select().where(WalletAuth.address == payload["address"].lower())
    )
    record = stored.fetchone()
    assert record is not None


@pytest.mark.asyncio
async def test_verify_signature_success(client, session, monkeypatch):
    addr = "0x1234567890abcdef1234567890abcdef12345678"
    wallet = WalletAuth(address=addr.lower(), nonce=secrets.token_hex(16))
    session.add(wallet)
    await session.commit()
    original_nonce = wallet.nonce

    message = f"Sign this message to authenticate: {wallet.nonce}"
    msg = encode_defunct(text=message)
    signature = Account.sign_message(msg, Account.create().key).signature.hex()

    def fake_recover_message(message, signature):
        return addr

    monkeypatch.setattr("routes.auth.Account.recover_message", fake_recover_message)

    res = await client.post("/auth/verify", json={"address": addr, "signature": signature})

    assert res.status_code == 200
    data = res.json()
    assert data["token"]
    assert data["address"] == addr.lower()

    await session.refresh(wallet)
    assert wallet.nonce != original_nonce


@pytest.mark.asyncio
async def test_verify_signature_invalid(client, session, monkeypatch):
    addr = "0x1234567890abcdef1234567890abcdef12345678"
    wallet = WalletAuth(address=addr.lower(), nonce=secrets.token_hex(16))
    session.add(wallet)
    await session.commit()

    monkeypatch.setattr(
        "routes.auth.Account.recover_message",
        lambda *_args, **_kwargs: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    )

    res = await client.post("/auth/verify", json={"address": addr, "signature": "0x0"})

    assert res.status_code == 400


@pytest.mark.asyncio
async def test_verify_signature_expired_nonce(client, session):
    addr = "0x1234567890abcdef1234567890abcdef12345678"
    payload = {"address": addr}

    first = await client.post("/auth/nonce", json=payload)
    assert first.status_code == 200

    res = await session.execute(select(WalletAuth).where(WalletAuth.address == addr.lower()))
    wallet = res.scalar_one()
    old_timestamp = (wallet.updated_at or datetime.now(timezone.utc)) - timedelta(
        seconds=settings.nonce_ttl_seconds + 10
    )
    wallet.updated_at = old_timestamp
    await session.commit()

    expired = await client.post("/auth/verify", json={"address": addr, "signature": "0xdead"})
    assert expired.status_code == 400
    assert expired.json()["detail"] == "nonce expired; request a new one"


@pytest.mark.asyncio
async def test_nonce_rate_limit(client):
    addr = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    payload = {"address": addr}

    for _ in range(settings.auth_rate_limit_max_requests):
        res = await client.post("/auth/nonce", json=payload)
        assert res.status_code == 200

    blocked = await client.post("/auth/nonce", json=payload)
    assert blocked.status_code == 429

