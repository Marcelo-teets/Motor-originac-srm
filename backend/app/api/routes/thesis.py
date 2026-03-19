from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.thesis import ThesisGenerateRequest, ThesisOutputResponse
from app.services.thesis_service import ThesisService

router = APIRouter(tags=["thesis"])


@router.post("/api/v1/thesis/generate", response_model=ThesisOutputResponse)
def generate_thesis(payload: ThesisGenerateRequest, db: Session = Depends(get_db)) -> ThesisOutputResponse:
    return ThesisService(db).generate_and_persist(payload.company_id, payload.investment_context)


@router.get("/api/v1/companies/{company_id}/thesis", response_model=ThesisOutputResponse)
def latest_thesis(company_id: int, db: Session = Depends(get_db)) -> ThesisOutputResponse:
    return ThesisService(db).latest(company_id)
