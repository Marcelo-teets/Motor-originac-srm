from sqlalchemy.orm import Session

from app.models import MarketMapCard
from app.repositories.company_repository import CompanyRepository
from app.repositories.market_map_repository import MarketMapRepository
from app.schemas.market_map import MarketMapCardResponse


class MarketMapService:
    def __init__(self, db: Session) -> None:
        self.company_repository = CompanyRepository(db)
        self.market_map_repository = MarketMapRepository(db)

    def generate_and_persist(self, company_id: int) -> MarketMapCardResponse:
        company = self.company_repository.get(company_id)
        primary_structure = "project finance" if "energy" in company.sector else "growth debt"
        entity = MarketMapCard(
            company_id=company.id,
            primary_asset_type="operating company",
            primary_structure=primary_structure,
            secondary_structures_json=["structured equity", "holdco facility"],
            market_fit_score=company.market_fit_score,
            investor_profile_hint=f"Funds with appetite for {company.sector} platforms and repeat capital deployment",
        )
        stored = self.market_map_repository.create(entity)
        return MarketMapCardResponse.model_validate(stored)

    def latest(self, company_id: int) -> MarketMapCardResponse:
        latest = self.market_map_repository.latest_by_company(company_id)
        if not latest:
            return self.generate_and_persist(company_id)
        return MarketMapCardResponse.model_validate(latest)
