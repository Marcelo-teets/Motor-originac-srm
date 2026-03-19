from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from motor_originacao.domain.enums import SignalType


class SignalCreate(BaseModel):
    company_id: str
    source_id: str
    tipo: SignalType
    titulo: str = Field(min_length=3, max_length=255)
    descricao: str | None = Field(default=None, max_length=1000)
    intensidade: int = Field(default=3, ge=1, le=5)
    signal_date: datetime | None = None


class SignalResponse(BaseModel):
    id: str
    company_id: str
    source_id: str
    tipo: SignalType
    titulo: str
    descricao: str | None
    intensidade: int
    signal_date: datetime
    created_at: datetime
