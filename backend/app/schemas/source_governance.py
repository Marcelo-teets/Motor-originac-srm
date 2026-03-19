from pydantic import BaseModel


class SourceGovernanceRequest(BaseModel):
    source_name: str
    source_type: str
    url: str | None = None
    reliability_hint: float | None = None


class SourceGovernanceResponse(BaseModel):
    source_name: str
    source_type: str
    confidence_score: float
    is_approved: bool
    rationale: str
