from sqlalchemy.orm import Session

from app.models import ThesisOutput
from app.repositories.company_repository import CompanyRepository
from app.repositories.score_history_repository import ScoreHistoryRepository
from app.repositories.thesis_repository import ThesisRepository
from app.schemas.thesis import ThesisOutputResponse


class ThesisService:
    def __init__(self, db: Session) -> None:
        self.company_repository = CompanyRepository(db)
        self.score_history_repository = ScoreHistoryRepository(db)
        self.thesis_repository = ThesisRepository(db)

    def generate_and_persist(self, company_id: int, investment_context: str | None = None) -> ThesisOutputResponse:
        company = self.company_repository.get(company_id)
        latest_score = self.score_history_repository.latest_by_company(company_id)
        ranking_context = latest_score.ranking_v2 if latest_score else company.current_ors_v2
        output = ThesisOutput(
            company_id=company.id,
            headline=f"{company.name} is emerging as a high-priority {company.sector} origination target",
            why_now_json=[
                f"Current ORS v2 at {company.current_ors_v2:.1f} supports immediate coverage",
                f"Ranking V2 context at {ranking_context:.1f} indicates near-term momentum",
                investment_context or "Sector catalysts suggest actionable financing demand",
            ],
            recommended_structures_json=["structured equity", "growth debt", "project finance"],
            key_risks_json=["execution pacing", "data freshness", "competitive lender pressure"],
            suggested_outreach_angle=f"Lead with a sector-specific financing thesis for {company.name} and anchor on current trigger momentum.",
        )
        stored = self.thesis_repository.create(output)
        return ThesisOutputResponse.model_validate(stored)

    def latest(self, company_id: int) -> ThesisOutputResponse:
        latest = self.thesis_repository.latest_by_company(company_id)
        if not latest:
            return self.generate_and_persist(company_id)
        return ThesisOutputResponse.model_validate(latest)
