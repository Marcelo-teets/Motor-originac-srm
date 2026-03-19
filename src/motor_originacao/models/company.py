from datetime import datetime

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
