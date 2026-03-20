from pydantic import BaseModel

from app.schemas.common import TimestampedResponse


class ScoreHistoryResponse(TimestampedResponse):
    company_id: int
    current_ors_v2: float
    score_delta: float
    trigger_strength: float
    source_confidence_score: float
    market_fit_score: float
    ranking_v2: float
    component_snapshot_json: dict


class RankingV2Row(BaseModel):
    company_id: int
    company_name: str
    current_ors_v2: float
    score_delta: float
    trigger_strength: float
    source_confidence_score: float
    market_fit_score: float
    ranking_v2: float
    tier: str
