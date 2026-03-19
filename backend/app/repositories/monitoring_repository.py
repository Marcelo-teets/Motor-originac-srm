from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MonitoringOutput


class MonitoringRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, monitoring_output: MonitoringOutput) -> MonitoringOutput:
        self.db.add(monitoring_output)
        self.db.commit()
        self.db.refresh(monitoring_output)
        return monitoring_output

    def latest_by_company(self, company_id: int) -> MonitoringOutput | None:
        stmt = (
            select(MonitoringOutput)
            .where(MonitoringOutput.company_id == company_id)
            .order_by(MonitoringOutput.created_at.desc(), MonitoringOutput.id.desc())
        )
        return self.db.scalars(stmt).first()
