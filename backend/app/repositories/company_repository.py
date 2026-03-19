from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Company


class CompanyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, company_id: int) -> Company:
        company = self.db.get(Company, company_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")
        return company

    def list_all(self) -> list[Company]:
        return list(self.db.scalars(select(Company).order_by(Company.name)).all())

    def seed_defaults(self) -> None:
        if self.db.scalars(select(Company)).first():
            return
        self.db.add_all(
            [
                Company(
                    name="Atlas Renewables",
                    sector="energy transition",
                    current_ors_v2=78.0,
                    source_confidence_score=72.0,
                    market_fit_score=75.0,
                    trigger_strength=66.0,
                ),
                Company(
                    name="Beacon Health Data",
                    sector="healthtech",
                    current_ors_v2=84.0,
                    source_confidence_score=81.0,
                    market_fit_score=79.0,
                    trigger_strength=74.0,
                ),
            ]
        )
        self.db.commit()
