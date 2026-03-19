from fastapi import APIRouter, HTTPException, Query, status

from motor_originacao.models.signal import SignalCreate, SignalResponse
from motor_originacao.services.app_state import entity_resolution_service, monitoring_service, source_governance_service

router = APIRouter(prefix="/signals", tags=["signals"])


@router.post("", response_model=SignalResponse, status_code=201)
def create_signal(payload: SignalCreate) -> SignalResponse:
    entity_resolution_service.get_company(payload.company_id)
    source_governance_service.get_source(payload.source_id)
    signal = monitoring_service.create_signal(payload)
    return SignalResponse.model_validate(signal, from_attributes=True)


@router.get("", response_model=list[SignalResponse])
def list_signals(company_id: str | None = Query(default=None)) -> list[SignalResponse]:
    signals = monitoring_service.list_signals(company_id=company_id)
    return [SignalResponse.model_validate(signal, from_attributes=True) for signal in signals]


@router.get("/{signal_id}", response_model=SignalResponse)
def get_signal(signal_id: str) -> SignalResponse:
    signal = monitoring_service.get_signal(signal_id)
    if not signal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sinal não encontrado.")
    return SignalResponse.model_validate(signal, from_attributes=True)
