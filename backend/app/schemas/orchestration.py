from pydantic import BaseModel

from app.schemas.market_map import MarketMapCardResponse
from app.schemas.monitoring import MonitoringOutputResponse
from app.schemas.score_history import ScoreHistoryResponse
from app.schemas.thesis import ThesisOutputResponse


class FullPipelineV2Response(BaseModel):
    pipeline_steps: list[str]
    monitoring: MonitoringOutputResponse
    score_history: ScoreHistoryResponse
    thesis: ThesisOutputResponse
    market_map: MarketMapCardResponse
