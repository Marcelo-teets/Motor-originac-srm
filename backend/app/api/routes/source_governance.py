from fastapi import APIRouter

from app.schemas.source_governance import SourceGovernanceRequest, SourceGovernanceResponse
from app.services.source_governance_service import SourceGovernanceService

router = APIRouter(prefix="/api/v1/source-governance", tags=["source-governance"])
service = SourceGovernanceService()


@router.post("/validate", response_model=SourceGovernanceResponse)
def validate_source(payload: SourceGovernanceRequest) -> SourceGovernanceResponse:
    return service.validate(payload)
