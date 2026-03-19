from datetime import datetime
from typing import List

from pydantic import BaseModel, Field


class CompanyCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=255)
    cnpj: str | None = Field(default=None, max_length=32)


class CompanyResponse(BaseModel):
    id: str
    nome: str
    normalized_nome: str
    cnpj: str | None
    normalized_cnpj: str | None
    created_at: datetime
    updated_at: datetime


class CompanyOverviewResponse(BaseModel):
    company: CompanyResponse
    signal_count: int
    source_count: int
    current_score: int
    score_band: str
    latest_signals: List[str]
