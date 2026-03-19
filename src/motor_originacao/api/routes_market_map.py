from fastapi import APIRouter

from motor_originacao.models.market_map import MarketMapCardResponse
from motor_originacao.services.app_state import market_map_service

router = APIRouter(prefix="/market-map", tags=["market-map"])


@router.get("", response_model=list[MarketMapCardResponse])
def list_market_map_cards() -> list[MarketMapCardResponse]:
    cards = market_map_service.list_cards()
    return [MarketMapCardResponse.model_validate(card, from_attributes=True) for card in cards]


@router.get("/{company_id}", response_model=MarketMapCardResponse)
def get_market_map_card(company_id: str) -> MarketMapCardResponse:
    card = market_map_service.build_card(company_id)
    return MarketMapCardResponse.model_validate(card, from_attributes=True)
