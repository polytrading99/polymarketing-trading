
from pydantic import BaseModel, Field

class MarketCreate(BaseModel):
    name: str
    external_id: str
    base_spread_bps: int = Field(ge=0, le=10000)
    enabled: bool = True

class MarketOut(BaseModel):
    id: int
    name: str
    external_id: str
    base_spread_bps: int
    enabled: bool
    class Config:
        from_attributes = True
