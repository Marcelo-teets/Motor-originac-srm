from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ThesisOutput


class ThesisRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, thesis_output: ThesisOutput) -> ThesisOutput:
        self.db.add(thesis_output)
        self.db.commit()
        self.db.refresh(thesis_output)
        return thesis_output

    def latest_by_company(self, company_id: int) -> ThesisOutput | None:
        stmt = (
            select(ThesisOutput)
            .where(ThesisOutput.company_id == company_id)
            .order_by(ThesisOutput.created_at.desc(), ThesisOutput.id.desc())
        )
        return self.db.scalars(stmt).first()
