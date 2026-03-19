from sqlalchemy.orm import Session

from app.models import ScoreHistoryV2
from app.repositories.company_repository import CompanyRepository
from app.repositories.score_history_repository import ScoreHistoryRepository
from app.schemas.score_history import RankingV2Row, ScoreHistoryResponse
from app.services.ranking_v2_service import RankingInputs, RankingV2Service


class ScoreHistoryService:
    def __init__(self, db: Session) -> None:
        self.company_repository = CompanyRepository(db)
        self.score_history_repository = ScoreHistoryRepository(db)
        self.ranking_service = RankingV2Service()

    def create_snapshot(self, company_id: int, score_delta: float) -> ScoreHistoryResponse:
        company = self.company_repository.get(company_id)
        ranking = self.ranking_service.calculate(
            RankingInputs(
                current_ors_v2=company.current_ors_v2,
                score_trend_delta_normalized=score_delta,
                trigger_strength=company.trigger_strength,
                source_confidence_score=company.source_confidence_score,
                market_fit_score=company.market_fit_score,
            )
        )
        entity = ScoreHistoryV2(
            company_id=company.id,
            current_ors_v2=company.current_ors_v2,
            score_delta=score_delta,
            trigger_strength=company.trigger_strength,
            source_confidence_score=company.source_confidence_score,
            market_fit_score=company.market_fit_score,
            ranking_v2=ranking,
            component_snapshot_json={
                "company_name": company.name,
                "sector": company.sector,
            },
        )
        stored = self.score_history_repository.create(entity)
        return ScoreHistoryResponse.model_validate(stored)

    def list_company_history(self, company_id: int) -> list[ScoreHistoryResponse]:
        history = self.score_history_repository.list_by_company(company_id)
        if not history:
            self.create_snapshot(company_id, score_delta=max(0.0, self.company_repository.get(company_id).current_ors_v2 - 25.0))
            history = self.score_history_repository.list_by_company(company_id)
        return [ScoreHistoryResponse.model_validate(item) for item in history]

    def ranking_rows(self) -> list[RankingV2Row]:
        latest_rows = self.score_history_repository.list_latest_rows()
        if not latest_rows:
            for company in self.company_repository.list_all():
                self.create_snapshot(company.id, score_delta=max(0.0, company.current_ors_v2 - 25.0))
            latest_rows = self.score_history_repository.list_latest_rows()
        seen: set[int] = set()
        results: list[RankingV2Row] = []
        for row in latest_rows:
            if row.company_id in seen:
                continue
            seen.add(row.company_id)
            company = self.company_repository.get(row.company_id)
            results.append(
                RankingV2Row(
                    company_id=company.id,
                    company_name=company.name,
                    current_ors_v2=row.current_ors_v2,
                    score_delta=row.score_delta,
                    trigger_strength=row.trigger_strength,
                    source_confidence_score=row.source_confidence_score,
                    market_fit_score=row.market_fit_score,
                    ranking_v2=row.ranking_v2,
                    tier=self.ranking_service.tier(row.ranking_v2),
                )
            )
        return results
