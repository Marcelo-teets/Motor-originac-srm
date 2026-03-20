from sqlalchemy.orm import Session

from app.models import MonitoringOutput
from app.repositories.company_repository import CompanyRepository
from app.repositories.monitoring_repository import MonitoringRepository
from app.schemas.monitoring import MonitoringOutputResponse


class MonitoringService:
    def __init__(self, db: Session) -> None:
        self.company_repository = CompanyRepository(db)
        self.monitoring_repository = MonitoringRepository(db)

    def run_and_persist(self, company_id: int) -> MonitoringOutputResponse:
        company = self.company_repository.get(company_id)
        signals = [
            f"{company.sector} demand expansion",
            f"new financing trigger for {company.name}",
            "management activity uptick",
        ]
        output = MonitoringOutput(
            company_id=company.id,
            source_type="aggregated-monitoring",
            source_name="origination-monitor",
            output_json={
                "company": company.name,
                "sector": company.sector,
                "signals_count": len(signals),
            },
            observed_signals_json=signals,
        )
        stored = self.monitoring_repository.create(output)
        return MonitoringOutputResponse.model_validate(stored)

    def latest(self, company_id: int) -> MonitoringOutputResponse:
        latest = self.monitoring_repository.latest_by_company(company_id)
        if not latest:
            return self.run_and_persist(company_id)
        return MonitoringOutputResponse.model_validate(latest)
