from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MarketMapCard


class MarketMapRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, market_map_card: MarketMapCard) -> MarketMapCard:
        self.db.add(market_map_card)
        self.db.commit()
        self.db.refresh(market_map_card)
        return market_map_card

    def latest_by_company(self, company_id: int) -> MarketMapCard | None:
        stmt = (
            select(MarketMapCard)
            .where(MarketMapCard.company_id == company_id)
            .order_by(MarketMapCard.created_at.desc(), MarketMapCard.id.desc())
        )
        return self.db.scalars(stmt).first()
