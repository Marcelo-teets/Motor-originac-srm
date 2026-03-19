from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from motor_originacao.domain.enums import ReliabilityLevel, SourceCategory


class SourceCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=255)
    categoria: SourceCategory
    confiabilidade: ReliabilityLevel
    ativa: bool = True
    pais: str = Field(default="BR", min_length=2, max_length=2)

    @field_validator("pais")
    @classmethod
    def validate_country(cls, value: str) -> str:
        upper = value.upper()
        if upper != "BR":
            raise ValueError("Apenas fontes BR são permitidas nesta fase.")
        return upper


class SourceResponse(BaseModel):
    id: str
    nome: str
    categoria: SourceCategory
    confiabilidade: ReliabilityLevel
    ativa: bool
    pais: str
    created_at: datetime
