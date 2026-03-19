from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, status

from motor_originacao.domain.entities import MarketMapCardEntity
from motor_originacao.repositories.in_memory_repository import InMemoryRepository
from motor_originacao.services.thesis_service import ThesisService
from motor_originacao.utils.time import utcnow


class MarketMapService:
    def __init__(self, repository: InMemoryRepository, thesis_service: ThesisService) -> None:
        self.repository = repository
        self.thesis_service = thesis_service

    def build_card(self, company_id: str) -> MarketMapCardEntity:
        company = self.repository.companies.get(company_id)
        if not company:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa não encontrada.")

        thesis = self.thesis_service.generate_for_company(company_id)
        latest_score = self.repository.score_history.get(company_id, [])[-1]
        signals = [self.repository.signals[sid] for sid in self.repository.signals_by_company.get(company_id, [])]
        sinais_chave = [signal.titulo for signal in sorted(signals, key=lambda item: item.intensidade, reverse=True)[:3]]

        segmento = "empresa com cnpj" if company.normalized_cnpj else "empresa em prospecção"
        card = MarketMapCardEntity(
            id=f"mmc_{uuid4().hex[:12]}",
            company_id=company_id,
            segmento=segmento,
            tese_curta=thesis.resumo,
            score_resumo=f"Score {latest_score.score} | recomendação {thesis.recomendacao.value}",
            sinais_chave=sinais_chave,
            updated_at=utcnow(),
        )
        return self.repository.store_market_map(card)

    def list_cards(self) -> list[MarketMapCardEntity]:
        cards = []
        for company_id in sorted(self.repository.companies):
            cards.append(self.build_card(company_id))
        return sorted(cards, key=lambda card: card.updated_at, reverse=True)
