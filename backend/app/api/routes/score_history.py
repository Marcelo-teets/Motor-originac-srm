from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.score_history import ScoreHistoryResponse
from app.services.score_history_service import ScoreHistoryService

router = APIRouter(tags=["score-history"])


@router.get("/api/v1/score-history/companies/{company_id}", response_model=list[ScoreHistoryResponse])
def company_score_history(company_id: int, db: Session = Depends(get_db)) -> list[ScoreHistoryResponse]:
    return ScoreHistoryService(db).list_company_history(company_id)
