from __future__ import annotations

from uuid import uuid4

from motor_originacao.domain.entities import SignalEntity
from motor_originacao.models.signal import SignalCreate
from motor_originacao.repositories.in_memory_repository import InMemoryRepository
from motor_originacao.services.scoring_service import ScoringService
from motor_originacao.utils.time import utcnow


class MonitoringService:
    def __init__(self, repository: InMemoryRepository, scoring_service: ScoringService) -> None:
        self.repository = repository
        self.scoring_service = scoring_service

    def create_signal(self, payload: SignalCreate) -> SignalEntity:
        signal = SignalEntity(
            id=f"sig_{uuid4().hex[:12]}",
            company_id=payload.company_id,
            source_id=payload.source_id,
            tipo=payload.tipo,
            titulo=payload.titulo.strip(),
            descricao=payload.descricao.strip() if payload.descricao else None,
            intensidade=payload.intensidade,
            signal_date=payload.signal_date or utcnow(),
            created_at=utcnow(),
        )
        self.repository.store_signal(signal)
        self.scoring_service.recalculate_for_company(payload.company_id)
        return signal

    def get_signal(self, signal_id: str) -> SignalEntity | None:
        return self.repository.signals.get(signal_id)

    def list_signals(self, company_id: str | None = None) -> list[SignalEntity]:
        signals = list(self.repository.signals.values())
        if company_id:
            signals = [signal for signal in signals if signal.company_id == company_id]
        return sorted(signals, key=lambda signal: signal.signal_date)
