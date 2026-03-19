from dataclasses import dataclass, field
from datetime import datetime
from typing import List

from motor_originacao.domain.enums import Recommendation, ReliabilityLevel, SignalType, SourceCategory


@dataclass(slots=True)
class CompanyEntity:
    id: str
    nome: str
    normalized_nome: str
    cnpj: str | None
    normalized_cnpj: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class SourceEntity:
    id: str
    nome: str
    categoria: SourceCategory
    confiabilidade: ReliabilityLevel
    ativa: bool
    pais: str
    created_at: datetime


@dataclass(slots=True)
class SignalEntity:
    id: str
    company_id: str
    source_id: str
    tipo: SignalType
    titulo: str
    descricao: str | None
    intensidade: int
    signal_date: datetime
    created_at: datetime


@dataclass(slots=True)
class ScoreSnapshotEntity:
    id: str
    company_id: str
    score: int
    rationale: List[str] = field(default_factory=list)
    calculated_at: datetime = field(default_factory=datetime.utcnow)


@dataclass(slots=True)
class ThesisEntity:
    id: str
    company_id: str
    resumo: str
    drivers: List[str]
    riscos: List[str]
    recomendacao: Recommendation
    generated_at: datetime
    based_on_signal_count: int
    based_on_score: int


@dataclass(slots=True)
class MarketMapCardEntity:
    id: str
    company_id: str
    segmento: str
    tese_curta: str
    score_resumo: str
    sinais_chave: List[str]
    updated_at: datetime
