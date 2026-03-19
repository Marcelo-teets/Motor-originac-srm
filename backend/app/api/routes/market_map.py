from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.market_map import MarketMapCardResponse, MarketMapGenerateRequest
from app.services.market_map_service import MarketMapService

router = APIRouter(tags=["market-map"])


@router.post("/api/v1/market-map/company-card", response_model=MarketMapCardResponse)
def generate_market_map(payload: MarketMapGenerateRequest, db: Session = Depends(get_db)) -> MarketMapCardResponse:
    return MarketMapService(db).generate_and_persist(payload.company_id)


@router.get("/api/v1/companies/{company_id}/market-map", response_model=MarketMapCardResponse)
def latest_market_map(company_id: int, db: Session = Depends(get_db)) -> MarketMapCardResponse:
    return MarketMapService(db).latest(company_id)
