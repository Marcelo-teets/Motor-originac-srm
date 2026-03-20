from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ScoreHistoryV2(Base):
    __tablename__ = "score_history_v2"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    current_ors_v2: Mapped[float] = mapped_column(Float, nullable=False)
    score_delta: Mapped[float] = mapped_column(Float, nullable=False)
    trigger_strength: Mapped[float] = mapped_column(Float, nullable=False)
    source_confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    market_fit_score: Mapped[float] = mapped_column(Float, nullable=False)
    ranking_v2: Mapped[float] = mapped_column(Float, nullable=False)
    component_snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    company = relationship("Company", back_populates="score_history_entries")
