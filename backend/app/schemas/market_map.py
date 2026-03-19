from pydantic import BaseModel

from app.schemas.common import TimestampedResponse


class MarketMapGenerateRequest(BaseModel):
    company_id: int


class MarketMapCardResponse(TimestampedResponse):
    company_id: int
    primary_asset_type: str
    primary_structure: str
    secondary_structures_json: list[str]
    market_fit_score: float
    investor_profile_hint: str
