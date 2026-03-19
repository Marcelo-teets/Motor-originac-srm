from fastapi import APIRouter

from motor_originacao.models.thesis import ThesisResponse
from motor_originacao.services.app_state import thesis_service

router = APIRouter(prefix="/thesis", tags=["thesis"])


@router.get("/{company_id}", response_model=ThesisResponse)
def get_thesis(company_id: str) -> ThesisResponse:
    thesis = thesis_service.generate_for_company(company_id)
    return ThesisResponse.model_validate(thesis, from_attributes=True)
