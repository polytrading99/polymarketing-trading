
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, Boolean, Numeric, ForeignKey, DateTime, func
from db import Base

class Market(Base):
    __tablename__ = "markets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    external_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    base_spread_bps: Mapped[int] = mapped_column(Integer, default=50)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

class PnLTicks(Base):
    __tablename__ = "pnl_ticks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    market_id: Mapped[int] = mapped_column(ForeignKey("markets.id", ondelete="CASCADE"), index=True)
    ts: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    pnl: Mapped[Numeric] = mapped_column(Numeric(18, 6), default=0)
    inventory: Mapped[Numeric] = mapped_column(Numeric(18, 6), default=0)

class WalletAuth(Base):
    __tablename__ = "wallet_auth"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    address: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    nonce: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
