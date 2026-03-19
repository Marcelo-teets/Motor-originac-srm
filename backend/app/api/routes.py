from fastapi import APIRouter, HTTPException, Query

from app.api.dependencies import get_service
from app.core.config import get_settings
from app.domain.models import CompanyCreate, HealthResponse, SignalCreate, ValidationError
from app.repositories.memory import DuplicateCompanyError, NotFoundError

router = APIRouter()
service = get_service()


@router.get('/health')
def healthcheck() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(service=settings.app_name)


@router.get('/sources')
def list_sources(category: str | None = Query(default=None)) -> dict:
    items = service.sources.list(category=category)
    return {'items': [item.to_dict() for item in items], 'total': len(items)}


@router.get('/companies')
def list_companies(sector: str | None = None, stage: str | None = None) -> dict:
    items = service.list_companies(sector=sector, stage=stage)
    return {'items': [item.to_dict() for item in items], 'total': len(items)}


@router.post('/companies', status_code=201)
def create_company(payload: dict):
    try:
        return service.create_company(CompanyCreate.from_dict(payload)).to_dict()
    except (DuplicateCompanyError, ValidationError) as exc:
        code = 409 if isinstance(exc, DuplicateCompanyError) else 422
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.get('/signals')
def list_signals(company_id: str | None = None) -> dict:
    items = service.list_signals(company_id=company_id)
    return {'items': [item.to_dict() for item in items], 'total': len(items)}


@router.post('/signals', status_code=201)
def create_signal(payload: dict):
    try:
        return service.create_signal(SignalCreate.from_dict(payload)).to_dict()
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get('/companies/{company_id}/score')
def get_score(company_id: str):
    try:
        return service.get_score(company_id).to_dict()
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get('/companies/{company_id}/score/history')
def get_score_history(company_id: str) -> dict:
    try:
        items = service.get_score_history(company_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {'items': [item.to_dict() for item in items], 'total': len(items)}


@router.get('/companies/{company_id}/thesis')
def get_thesis(company_id: str):
    try:
        return service.get_thesis(company_id).to_dict()
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get('/market-map')
def get_market_map() -> dict:
    items = service.get_market_map()
    return {'items': [item.to_dict() for item in items], 'total': len(items)}
