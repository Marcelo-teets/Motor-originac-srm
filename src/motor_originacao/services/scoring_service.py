from __future__ import annotations

from uuid import uuid4

from motor_originacao.domain.entities import ScoreSnapshotEntity
from motor_originacao.domain.enums import ReliabilityLevel, SignalType
from motor_originacao.repositories.in_memory_repository import InMemoryRepository
from motor_originacao.utils.time import utcnow


RELIABILITY_MULTIPLIER = {
    ReliabilityLevel.VERY_LOW: 0.6,
    ReliabilityLevel.LOW: 0.8,
    ReliabilityLevel.MEDIUM: 1.0,
    ReliabilityLevel.HIGH: 1.15,
    ReliabilityLevel.VERY_HIGH: 1.3,
}

SIGNAL_DIRECTION = {
    SignalType.POSITIVE: 1,
    SignalType.GROWTH: 1,
    SignalType.NEUTRAL: 0,
    SignalType.ALERT: -1,
    SignalType.NEGATIVE: -1,
    SignalType.RISK: -1,
}


class ScoringService:
    def __init__(self, repository: InMemoryRepository) -> None:
        self.repository = repository

    def recalculate_for_company(self, company_id: str) -> ScoreSnapshotEntity:
        signals = [self.repository.signals[signal_id] for signal_id in self.repository.signals_by_company[company_id]]
        base_score = 50
        rationale = ["Score base inicial de 50 pontos."]
        total_delta = 0.0

        for signal in signals:
            source = self.repository.sources[signal.source_id]
            direction = SIGNAL_DIRECTION[signal.tipo]
            multiplier = RELIABILITY_MULTIPLIER[source.confiabilidade]
            raw_delta = direction * signal.intensidade * 6
            weighted_delta = raw_delta * multiplier
            total_delta += weighted_delta
            rationale.append(
                f"Sinal '{signal.titulo}' ({signal.tipo.value}) com intensidade {signal.intensidade} via {source.nome} ajustou {weighted_delta:.1f} pontos."
            )

        score = max(0, min(100, round(base_score + total_delta)))
        if not signals:
            rationale.append("Sem sinais, score permanece neutro.")
        elif score >= 75:
            rationale.append("Acúmulo de sinais confiáveis elevou o score para faixa prioritária.")
        elif score <= 35:
            rationale.append("Predominância de riscos levou o score para faixa crítica.")
        else:
            rationale.append("Mix de sinais mantém a empresa em observação ativa.")

        snapshot = ScoreSnapshotEntity(
            id=f"scr_{uuid4().hex[:12]}",
            company_id=company_id,
            score=score,
            rationale=rationale,
            calculated_at=utcnow(),
        )
        return self.repository.store_score_snapshot(snapshot)

    def get_score_band(self, score: int) -> str:
        if score >= 75:
            return "prioritario"
        if score >= 55:
            return "monitorar"
        if score >= 35:
            return "cautela"
        return "critico"

    def get_current_score(self, company_id: str) -> ScoreSnapshotEntity | None:
        history = self.repository.score_history.get(company_id, [])
        return history[-1] if history else None

    def get_history(self, company_id: str) -> list[ScoreSnapshotEntity]:
        return list(self.repository.score_history.get(company_id, []))
