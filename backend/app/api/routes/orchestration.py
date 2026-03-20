from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.orchestration import FullPipelineV2Response
from app.services.orchestration_service import OrchestrationService

router = APIRouter(tags=["orchestration"])


@router.post("/api/v1/orchestration/companies/{company_id}/full-pipeline-v2", response_model=FullPipelineV2Response)
def run_full_pipeline(company_id: int, db: Session = Depends(get_db)) -> FullPipelineV2Response:
    return OrchestrationService(db).run_full_pipeline_v2(company_id)
