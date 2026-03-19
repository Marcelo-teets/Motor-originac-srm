from fastapi import APIRouter, HTTPException, status

from motor_originacao.models.copilot import CopilotContextResponse
from motor_originacao.services.app_state import copilot_service

router = APIRouter(prefix="/copilot", tags=["copilot"])


@router.get("/{company_id}/context", response_model=CopilotContextResponse)
def get_copilot_context(company_id: str) -> CopilotContextResponse:
    try:
        return copilot_service.build_context(company_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
