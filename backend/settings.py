import os
from functools import lru_cache
from typing import List


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_list(value: str | None, default: List[str]) -> List[str]:
    if value is None:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    def __init__(self) -> None:
        self.cors_allowed_origins: List[str] = _parse_list(
            os.getenv("CORS_ALLOWED_ORIGINS"),
            ["http://localhost:3000"],
        )
        self.enforce_https: bool = _parse_bool(os.getenv("ENFORCE_HTTPS"), default=False)
        self.nonce_ttl_seconds: int = int(os.getenv("NONCE_TTL_SECONDS", "300"))
        self.auth_rate_limit_window_seconds: int = int(
            os.getenv("AUTH_RATE_LIMIT_WINDOW_SECONDS", "60")
        )
        self.auth_rate_limit_max_requests: int = int(
            os.getenv("AUTH_RATE_LIMIT_MAX_REQUESTS", "10")
        )
        self.polymarket_public_api_base: str = os.getenv(
            "POLYMARKET_PUBLIC_API_BASE", "https://gamma-api.polymarket.com"
        )
        self.polymarket_api_base: str = os.getenv(
            "POLYMARKET_API_BASE", "https://clob.polymarket.com"
        )
        self.polymarket_api_key: str | None = os.getenv("POLYMARKET_API_KEY")
        self.polymarket_timeout_seconds: float = float(
            os.getenv("POLYMARKET_TIMEOUT_SECONDS", "5.0")
        )
        self.bot_loop_interval_seconds: float = float(
            os.getenv("BOT_LOOP_INTERVAL_SECONDS", "1.0")
        )
        self.bot_retry_backoff_seconds: float = float(
            os.getenv("BOT_RETRY_BACKOFF_SECONDS", "2.0")
        )
        self.bot_max_backoff_seconds: float = float(
            os.getenv("BOT_MAX_BACKOFF_SECONDS", "30.0")
        )
        self.bot_quote_size: float = float(os.getenv("BOT_QUOTE_SIZE", "25"))
        self.bot_inventory_cap: float = float(os.getenv("BOT_INVENTORY_CAP", "1000"))


@lru_cache()
def get_settings() -> Settings:
    return Settings()

