from decimal import Decimal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class Proposta(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    nome_cliente: str = Field(..., min_length=3, max_length=120)
    documento: str = Field(..., min_length=11, max_length=20)
    valor: Decimal = Field(..., gt=0)
    produto: str = Field(..., min_length=2, max_length=100)
    prazo_meses: int = Field(..., gt=0, le=360)
