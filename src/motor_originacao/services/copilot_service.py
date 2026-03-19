from __future__ import annotations

from motor_originacao.models.copilot import CopilotContextResponse
from motor_originacao.repositories.in_memory_repository import InMemoryRepository
from motor_originacao.services.scoring_service import ScoringService
from motor_originacao.services.thesis_service import ThesisService


class CopilotService:
    def __init__(
        self,
        repository: InMemoryRepository,
        scoring_service: ScoringService,
        thesis_service: ThesisService,
    ) -> None:
        self.repository = repository
        self.scoring_service = scoring_service
        self.thesis_service = thesis_service

    def build_context(self, company_id: str) -> CopilotContextResponse:
        company = self.repository.get_company_by_id(company_id)
        if not company:
            raise ValueError("Empresa não encontrada.")

        thesis = self.thesis_service.generate_for_company(company_id)
        score_snapshot = self.scoring_service.get_current_score(company_id)
        current_score = score_snapshot.score if score_snapshot else 50
        recent_signals = sorted(
            self.repository.list_company_signals(company_id),
            key=lambda signal: signal.signal_date,
            reverse=True,
        )[:5]

        return CopilotContextResponse(
            company_id=company_id,
            company_nome=company.nome,
            score_atual=current_score,
            score_faixa=self.scoring_service.get_score_band(current_score),
            resumo_tese=thesis.resumo,
            drivers=thesis.drivers,
            riscos=thesis.riscos,
            sinais_recentes=[signal.titulo for signal in recent_signals],
            perguntas_sugeridas=[
                f"Quais evidências reforçam ou enfraquecem a tese para {company.nome}?",
                "Quais fontes adicionais BR devemos consultar para aumentar convicção?",
                "Quais próximos sinais mudariam materialmente a recomendação atual?",
            ],
        )
