from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.score_history import RankingV2Row
from app.services.score_history_service import ScoreHistoryService

router = APIRouter(tags=["rankings"])


@router.get("/api/v1/rankings/v2", response_model=list[RankingV2Row])
def rankings_v2(db: Session = Depends(get_db)) -> list[RankingV2Row]:
    return ScoreHistoryService(db).ranking_rows()
