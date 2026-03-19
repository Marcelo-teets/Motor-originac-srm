from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.monitoring import MonitoringOutputResponse
from app.services.monitoring_service import MonitoringService

router = APIRouter(tags=["monitoring"])


@router.get("/api/v1/companies/{company_id}/monitoring-output", response_model=MonitoringOutputResponse)
def latest_monitoring_output(company_id: int, db: Session = Depends(get_db)) -> MonitoringOutputResponse:
    return MonitoringService(db).latest(company_id)
