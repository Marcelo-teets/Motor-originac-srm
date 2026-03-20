from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ScoreHistoryV2


class ScoreHistoryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, score_history: ScoreHistoryV2) -> ScoreHistoryV2:
        self.db.add(score_history)
        self.db.commit()
        self.db.refresh(score_history)
        return score_history

    def latest_by_company(self, company_id: int) -> ScoreHistoryV2 | None:
        stmt = (
            select(ScoreHistoryV2)
            .where(ScoreHistoryV2.company_id == company_id)
            .order_by(ScoreHistoryV2.created_at.desc(), ScoreHistoryV2.id.desc())
        )
        return self.db.scalars(stmt).first()

    def list_by_company(self, company_id: int) -> list[ScoreHistoryV2]:
        stmt = (
            select(ScoreHistoryV2)
            .where(ScoreHistoryV2.company_id == company_id)
            .order_by(ScoreHistoryV2.created_at.desc(), ScoreHistoryV2.id.desc())
        )
        return list(self.db.scalars(stmt).all())

    def list_latest_rows(self) -> list[ScoreHistoryV2]:
        stmt = select(ScoreHistoryV2).order_by(ScoreHistoryV2.ranking_v2.desc())
        return list(self.db.scalars(stmt).all())
