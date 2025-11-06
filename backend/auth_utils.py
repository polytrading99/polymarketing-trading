import os
import time
from typing import Optional

import jwt

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"
JWT_TTL_SECONDS = int(os.getenv("JWT_TTL_SECONDS", "86400"))


def create_jwt(address: str) -> str:
    now = int(time.time())
    payload = {
        "sub": address.lower(),
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
        "typ": "Bearer",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def verify_jwt(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return str(payload.get("sub")) if payload.get("sub") else None
    except Exception:
        return None


