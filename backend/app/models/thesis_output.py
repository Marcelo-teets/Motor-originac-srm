from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ThesisOutput(Base):
    __tablename__ = "thesis_outputs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    headline: Mapped[str] = mapped_column(String(255), nullable=False)
    why_now_json: Mapped[list] = mapped_column(JSON, default=list)
    recommended_structures_json: Mapped[list] = mapped_column(JSON, default=list)
    key_risks_json: Mapped[list] = mapped_column(JSON, default=list)
    suggested_outreach_angle: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    company = relationship("Company", back_populates="thesis_outputs")
