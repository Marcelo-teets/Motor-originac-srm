from fastapi import APIRouter

from motor_originacao.models.score import ScoreCurrentResponse, ScoreSnapshotResponse
from motor_originacao.services.app_state import entity_resolution_service, scoring_service

router = APIRouter(prefix="/scores", tags=["scores"])


@router.get("/{company_id}", response_model=ScoreCurrentResponse)
def get_current_score(company_id: str) -> ScoreCurrentResponse:
    entity_resolution_service.get_company(company_id)
    latest = scoring_service.get_current_score(company_id)
    return ScoreCurrentResponse(
        company_id=company_id,
        current_score=latest.score if latest else 50,
        latest_snapshot=ScoreSnapshotResponse.model_validate(latest, from_attributes=True) if latest else None,
        snapshot_count=len(scoring_service.get_history(company_id)),
    )


@router.get("/{company_id}/history", response_model=list[ScoreSnapshotResponse])
def get_score_history(company_id: str) -> list[ScoreSnapshotResponse]:
    entity_resolution_service.get_company(company_id)
    history = scoring_service.get_history(company_id)
    return [ScoreSnapshotResponse.model_validate(snapshot, from_attributes=True) for snapshot in history]
