from __future__ import annotations

from motor_originacao.domain.entities import SignalEntity
from motor_originacao.models.signal import SignalCreate
from motor_originacao.repositories.in_memory_repository import InMemoryRepository
from motor_originacao.services.scoring_service import ScoringService
from motor_originacao.utils.identity import build_deterministic_id
from motor_originacao.utils.normalization import normalize_name
from motor_originacao.utils.time import utcnow


class MonitoringService:
    def __init__(self, repository: InMemoryRepository, scoring_service: ScoringService) -> None:
        self.repository = repository
        self.scoring_service = scoring_service

    def create_signal(self, payload: SignalCreate) -> SignalEntity:
        signal_date = payload.signal_date or utcnow()
        fingerprint = "::".join(
            [
                payload.company_id,
                payload.source_id,
                payload.tipo.value,
                normalize_name(payload.titulo),
                signal_date.date().isoformat(),
            ]
        )
        existing_signal_id = self.repository.signal_ids_by_fingerprint.get(fingerprint)
        if existing_signal_id:
            return self.repository.signals[existing_signal_id]

        signal = SignalEntity(
            id=build_deterministic_id("sig", fingerprint),
            company_id=payload.company_id,
            source_id=payload.source_id,
            tipo=payload.tipo,
            titulo=payload.titulo.strip(),
            descricao=payload.descricao.strip() if payload.descricao else None,
            intensidade=payload.intensidade,
            signal_date=signal_date,
            created_at=utcnow(),
        )
        self.repository.store_signal(signal)
        self.repository.signal_ids_by_fingerprint[fingerprint] = signal.id
        self.scoring_service.recalculate_for_company(payload.company_id)
        return signal

    def get_signal(self, signal_id: str) -> SignalEntity | None:
        return self.repository.get_signal(signal_id)

    def list_signals(self, company_id: str | None = None) -> list[SignalEntity]:
        signals = self.repository.list_signals()
        if company_id:
            signals = [signal for signal in signals if signal.company_id == company_id]
        return sorted(signals, key=lambda signal: signal.signal_date)

    def list_company_signals(self, company_id: str) -> list[SignalEntity]:
        signals = self.repository.list_company_signals(company_id)
        return sorted(signals, key=lambda signal: signal.signal_date)
