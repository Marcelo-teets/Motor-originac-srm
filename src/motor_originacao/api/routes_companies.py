from fastapi import APIRouter, Query

from motor_originacao.models.company import CompanyCreate, CompanyOverviewResponse, CompanyResponse
from motor_originacao.models.signal import SignalResponse
from motor_originacao.services.app_state import entity_resolution_service, monitoring_service, repository, scoring_service

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
    signals = monitoring_service.list_company_signals(company_id)
    return [SignalResponse.model_validate(signal, from_attributes=True) for signal in signals]


@router.get("/{company_id}/overview", response_model=CompanyOverviewResponse)
def get_company_overview(company_id: str) -> CompanyOverviewResponse:
    company = entity_resolution_service.get_company(company_id)
    signals = monitoring_service.list_company_signals(company_id)
    current_score = scoring_service.get_current_score(company_id)
    sources = {signal.source_id for signal in signals}
    score_value = current_score.score if current_score else 50
    return CompanyOverviewResponse(
        company=CompanyResponse.model_validate(company, from_attributes=True),
        signal_count=len(signals),
        source_count=len(sources),
        current_score=score_value,
        score_band=scoring_service.get_score_band(score_value),
        latest_signals=[signal.titulo for signal in signals[-3:]],
    )
