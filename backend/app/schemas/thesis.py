from pydantic import BaseModel

from app.schemas.common import TimestampedResponse


class ThesisGenerateRequest(BaseModel):
    company_id: int
    investment_context: str | None = None


class ThesisOutputResponse(TimestampedResponse):
    company_id: int
    headline: str
    why_now_json: list[str]
    recommended_structures_json: list[str]
    key_risks_json: list[str]
    suggested_outreach_angle: str
