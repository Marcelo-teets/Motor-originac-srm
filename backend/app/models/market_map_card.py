from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MarketMapCard(Base):
    __tablename__ = "market_map_cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    primary_asset_type: Mapped[str] = mapped_column(String(120), nullable=False)
    primary_structure: Mapped[str] = mapped_column(String(120), nullable=False)
    secondary_structures_json: Mapped[list] = mapped_column(JSON, default=list)
    market_fit_score: Mapped[float] = mapped_column(Float, nullable=False)
    investor_profile_hint: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    company = relationship("Company", back_populates="market_map_cards")
