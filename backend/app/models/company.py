from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sector: Mapped[str] = mapped_column(String(120), default="unknown")
    current_ors_v2: Mapped[float] = mapped_column(Float, default=0.0)
    source_confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    market_fit_score: Mapped[float] = mapped_column(Float, default=0.0)
    trigger_strength: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    score_history_entries = relationship("ScoreHistoryV2", back_populates="company", cascade="all, delete-orphan")
    thesis_outputs = relationship("ThesisOutput", back_populates="company", cascade="all, delete-orphan")
    market_map_cards = relationship("MarketMapCard", back_populates="company", cascade="all, delete-orphan")
    monitoring_outputs = relationship("MonitoringOutput", back_populates="company", cascade="all, delete-orphan")
