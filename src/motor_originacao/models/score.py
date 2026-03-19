from datetime import datetime
from typing import List

from pydantic import BaseModel


class ScoreSnapshotResponse(BaseModel):
    id: str
    company_id: str
    score: int
    rationale: List[str]
    calculated_at: datetime


class ScoreCurrentResponse(BaseModel):
    company_id: str
    current_score: int
    score_band: str
    latest_snapshot: ScoreSnapshotResponse | None
    snapshot_count: int
