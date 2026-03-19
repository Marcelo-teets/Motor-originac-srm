from fastapi import APIRouter, Query

from motor_originacao.models.company import CompanyCreate, CompanyResponse
from motor_originacao.models.signal import SignalResponse
from motor_originacao.services.app_state import entity_resolution_service, repository

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("", response_model=CompanyResponse)
def create_company(payload: CompanyCreate) -> CompanyResponse:
    company = entity_resolution_service.create_or_resolve_company(payload)
    return CompanyResponse.model_validate(company, from_attributes=True)


@router.get("", response_model=list[CompanyResponse])
def list_companies(
    nome: str | None = Query(default=None),
    cnpj: str | None = Query(default=None),
) -> list[CompanyResponse]:
    companies = entity_resolution_service.list_companies(nome=nome, cnpj=cnpj)
    return [CompanyResponse.model_validate(company, from_attributes=True) for company in companies]


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(company_id: str) -> CompanyResponse:
    company = entity_resolution_service.get_company(company_id)
    return CompanyResponse.model_validate(company, from_attributes=True)


@router.get("/{company_id}/signals", response_model=list[SignalResponse])
def get_company_signals(company_id: str) -> list[SignalResponse]:
    entity_resolution_service.get_company(company_id)
    signal_ids = repository.signals_by_company.get(company_id, [])
    signals = [repository.signals[signal_id] for signal_id in signal_ids]
    return [SignalResponse.model_validate(signal, from_attributes=True) for signal in signals]
