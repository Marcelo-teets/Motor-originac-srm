from pydantic import BaseModel, Field


class EntityResolutionRequest(BaseModel):
    company_name: str
    website: str | None = None
    aliases: list[str] = Field(default_factory=list)


class EntityResolutionResponse(BaseModel):
    canonical_name: str
    normalized_domain: str | None = None
    matched_aliases: list[str]
    confidence: float
