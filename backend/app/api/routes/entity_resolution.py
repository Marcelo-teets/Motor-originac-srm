from fastapi import APIRouter

from app.schemas.entity_resolution import EntityResolutionRequest, EntityResolutionResponse
from app.services.entity_resolution_service import EntityResolutionService

router = APIRouter(prefix="/api/v1/entity-resolution", tags=["entity-resolution"])
service = EntityResolutionService()


@router.post("/resolve", response_model=EntityResolutionResponse)
def resolve_entity(payload: EntityResolutionRequest) -> EntityResolutionResponse:
    return service.resolve(payload)
