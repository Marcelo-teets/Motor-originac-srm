from fastapi import APIRouter, Query

from motor_originacao.models.source import SourceCreate, SourceResponse
from motor_originacao.services.app_state import source_governance_service

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceResponse])
def list_sources(active_only: bool = Query(default=False)) -> list[SourceResponse]:
    sources = source_governance_service.list_sources(active_only=active_only)
    return [SourceResponse.model_validate(source, from_attributes=True) for source in sources]


@router.post("", response_model=SourceResponse, status_code=201)
def create_source(payload: SourceCreate) -> SourceResponse:
    source = source_governance_service.create_source(payload)
    return SourceResponse.model_validate(source, from_attributes=True)
