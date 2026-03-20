from sqlalchemy.orm import Session

from app.schemas.orchestration import FullPipelineV2Response
from app.services.market_map_service import MarketMapService
from app.services.monitoring_service import MonitoringService
from app.services.score_history_service import ScoreHistoryService
from app.services.thesis_service import ThesisService


class OrchestrationService:
    def __init__(self, db: Session) -> None:
        self.monitoring_service = MonitoringService(db)
        self.score_history_service = ScoreHistoryService(db)
        self.thesis_service = ThesisService(db)
        self.market_map_service = MarketMapService(db)

    def run_full_pipeline_v2(self, company_id: int) -> FullPipelineV2Response:
        monitoring = self.monitoring_service.run_and_persist(company_id)
        score_delta = min(100.0, 40.0 + (len(monitoring.observed_signals_json) * 8.5))
        score_history = self.score_history_service.create_snapshot(company_id, score_delta=score_delta)
        thesis = self.thesis_service.generate_and_persist(company_id)
        market_map = self.market_map_service.generate_and_persist(company_id)
        return FullPipelineV2Response(
            pipeline_steps=[
                "monitoring",
                "research",
                "enrichment",
                "scoring",
                "trigger",
                "ranking",
                "score_history",
                "thesis",
                "market_map",
            ],
            monitoring=monitoring,
            score_history=score_history,
            thesis=thesis,
            market_map=market_map,
        )
