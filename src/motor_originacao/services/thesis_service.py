from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, status

from motor_originacao.domain.entities import ThesisEntity
from motor_originacao.domain.enums import Recommendation, ReliabilityLevel, SignalType
from motor_originacao.repositories.in_memory_repository import InMemoryRepository
from motor_originacao.services.scoring_service import ScoringService
from motor_originacao.utils.time import utcnow


class ThesisService:
    def __init__(self, repository: InMemoryRepository, scoring_service: ScoringService) -> None:
        self.repository = repository
        self.scoring_service = scoring_service

    def generate_for_company(self, company_id: str) -> ThesisEntity:
        company = self.repository.companies.get(company_id)
        if not company:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa não encontrada.")

        current_score = self.scoring_service.get_current_score(company_id)
        if not current_score:
            current_score = self.scoring_service.recalculate_for_company(company_id)

        signals = [self.repository.signals[sid] for sid in self.repository.signals_by_company.get(company_id, [])]
        sources = [self.repository.sources[signal.source_id] for signal in signals]
        positive_count = sum(1 for signal in signals if signal.tipo in {SignalType.POSITIVE, SignalType.GROWTH})
        negative_count = sum(1 for signal in signals if signal.tipo in {SignalType.NEGATIVE, SignalType.RISK, SignalType.ALERT})
        diversified_sources = len({source.id for source in sources})
        high_quality_sources = sum(1 for source in sources if source.confiabilidade in {ReliabilityLevel.HIGH, ReliabilityLevel.VERY_HIGH})

        if current_score.score >= 75:
            recommendation = Recommendation.PRIORITIZE
        elif current_score.score >= 55:
            recommendation = Recommendation.MONITOR
        elif current_score.score >= 35:
            recommendation = Recommendation.CAUTION
        else:
            recommendation = Recommendation.AVOID

        resumo = (
            f"{company.nome} apresenta score {current_score.score}, com {positive_count} sinais positivos e "
            f"{negative_count} sinais de risco monitorados em {diversified_sources} fontes."
        )

        drivers = [
            f"Score atual em {current_score.score}, indicando estágio de originação '{recommendation.value}'.",
            f"Cobertura distribuída em {diversified_sources} fontes relevantes do ecossistema BR.",
        ]
        if positive_count:
            drivers.append(f"Existem {positive_count} sinais pró-crescimento ou positivos sustentando a tese.")
        if high_quality_sources:
            drivers.append(f"{high_quality_sources} sinais vieram de fontes de alta confiabilidade.")
        if not signals:
            drivers.append("A tese ainda é preliminar por ausência de sinais observados.")

        riscos = []
        if negative_count:
            riscos.append(f"Há {negative_count} sinais negativos/alertas impactando o racional de entrada.")
        if diversified_sources < 2:
            riscos.append("Baixa diversidade de fontes ainda limita a convicção analítica.")
        if current_score.score < 50:
            riscos.append("O score abaixo da linha neutra exige diligência adicional antes de avançar.")
        if not riscos:
            riscos.append("No estágio atual, os riscos observados estão controlados frente ao conjunto de sinais.")

        existing = self.repository.theses_by_company.get(company_id)
        should_regenerate = (
            existing is None
            or existing.based_on_signal_count != len(signals)
            or existing.based_on_score != current_score.score
        )
        if not should_regenerate:
            return existing

        thesis = ThesisEntity(
            id=f"ths_{uuid4().hex[:12]}",
            company_id=company_id,
            resumo=resumo,
            drivers=drivers,
            riscos=riscos,
            recomendacao=recommendation,
            generated_at=utcnow(),
            based_on_signal_count=len(signals),
            based_on_score=current_score.score,
        )
        return self.repository.store_thesis(thesis)
