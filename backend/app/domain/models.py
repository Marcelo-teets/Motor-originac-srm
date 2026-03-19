from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_name(value: str) -> str:
    return ' '.join(value.lower().strip().split())


def digits_only(value: str | None) -> str | None:
    if value is None:
        return None
    digits = ''.join(ch for ch in value if ch.isdigit())
    return digits or None


class ValidationError(ValueError):
    pass


@dataclass
class ModelMixin:
    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        for key, value in list(data.items()):
            if isinstance(value, datetime):
                data[key] = value.isoformat()
        return data


@dataclass
class HealthResponse(ModelMixin):
    service: str
    status: str = 'ok'
    version: str = '0.1.0'


@dataclass
class Source(ModelMixin):
    id: str
    name: str
    category: str
    region: str = 'BR'
    reliability: int = 5
    active: bool = True


@dataclass
class CompanyCreate:
    name: str
    sector: str
    stage: str = 'lead'
    cnpj: str | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> 'CompanyCreate':
        name = (payload.get('name') or '').strip()
        sector = (payload.get('sector') or '').strip()
        stage = (payload.get('stage') or 'lead').strip()
        cnpj = digits_only(payload.get('cnpj'))
        if len(name) < 2:
            raise ValidationError('name must have at least 2 characters')
        if not sector:
            raise ValidationError('sector is required')
        if cnpj and len(cnpj) != 14:
            raise ValidationError('cnpj must have 14 digits')
        return cls(name=name, cnpj=cnpj, sector=sector, stage=stage)


@dataclass
class Company(ModelMixin):
    id: str
    name: str
    normalized_name: str
    sector: str
    stage: str
    created_at: datetime
    cnpj: str | None = None


@dataclass
class SignalCreate:
    company_id: str
    source_id: str
    signal_type: str
    strength: int
    summary: str

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> 'SignalCreate':
        company_id = payload.get('company_id') or ''
        source_id = payload.get('source_id') or ''
        signal_type = (payload.get('signal_type') or '').strip()
        summary = (payload.get('summary') or '').strip()
        strength = payload.get('strength')
        if not company_id:
            raise ValidationError('company_id is required')
        if not source_id:
            raise ValidationError('source_id is required')
        if len(signal_type) < 2:
            raise ValidationError('signal_type must have at least 2 characters')
        if len(summary) < 8:
            raise ValidationError('summary must have at least 8 characters')
        if not isinstance(strength, int) or not 1 <= strength <= 100:
            raise ValidationError('strength must be between 1 and 100')
        return cls(company_id=company_id, source_id=source_id, signal_type=signal_type, strength=strength, summary=summary)


@dataclass
class Signal(ModelMixin):
    id: str
    company_id: str
    source_id: str
    signal_type: str
    strength: int
    summary: str
    created_at: datetime


@dataclass
class ScoreBreakdown(ModelMixin):
    source_diversity: int
    signal_strength: int
    recency: int


@dataclass
class ScoreSnapshot(ModelMixin):
    company_id: str
    score: int
    breakdown: ScoreBreakdown
    calculated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        data = super().to_dict()
        data['breakdown'] = self.breakdown.to_dict()
        return data


@dataclass
class ThesisResponse(ModelMixin):
    company_id: str
    summary: str
    rationale: list[str]
    score: int
    recommendation: str
    updated_at: datetime


@dataclass
class MarketMapEntry(ModelMixin):
    sector: str
    company_count: int
    average_score: float
