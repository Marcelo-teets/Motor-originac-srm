from __future__ import annotations

from collections import defaultdict

from app.domain.models import (
    Company,
    CompanyCreate,
    MarketMapEntry,
    ScoreBreakdown,
    ScoreSnapshot,
    Signal,
    SignalCreate,
    ThesisResponse,
    utcnow,
)
from app.repositories.memory import CompanyRepository, NotFoundError, ScoreRepository, SignalRepository, SourceRepository


class OriginationService:
    def __init__(
        self,
        sources: SourceRepository,
        companies: CompanyRepository,
        signals: SignalRepository,
        scores: ScoreRepository,
    ) -> None:
        self.sources = sources
        self.companies = companies
        self.signals = signals
        self.scores = scores

    def create_company(self, payload: CompanyCreate) -> Company:
        company = self.companies.create(payload)
        self._recalculate_score(company.id)
        return company

    def list_companies(self, sector: str | None = None, stage: str | None = None) -> list[Company]:
        return self.companies.list(sector=sector, stage=stage)

    def create_signal(self, payload: SignalCreate) -> Signal:
        self.companies.get(payload.company_id)
        if not self.sources.exists(payload.source_id):
            raise NotFoundError("source not found")
        signal = self.signals.create(payload)
        self._recalculate_score(payload.company_id)
        return signal

    def list_signals(self, company_id: str | None = None) -> list[Signal]:
        return self.signals.list(company_id=company_id)

    def get_score(self, company_id: str) -> ScoreSnapshot:
        self.companies.get(company_id)
        score = self.scores.current(company_id)
        if not score:
            score = self._recalculate_score(company_id)
        return score

    def get_score_history(self, company_id: str) -> list[ScoreSnapshot]:
        self.companies.get(company_id)
        history = self.scores.history(company_id)
        if not history:
            history = [self._recalculate_score(company_id)]
        return history

    def get_thesis(self, company_id: str) -> ThesisResponse:
        company = self.companies.get(company_id)
        score = self.get_score(company_id)
        signals = self.signals.list(company_id=company_id)
        rationale = [
            f"Setor monitorado: {company.sector}.",
            f"Quantidade de sinais observados: {len(signals)}.",
            f"Cobertura de fontes: {len({signal.source_id for signal in signals})} origem(ns).",
        ]
        if score.score >= 75:
            recommendation = "priorizar"
            summary = f"{company.name} apresenta densidade de sinais suficiente para priorização comercial."
        elif score.score >= 45:
            recommendation = "monitorar"
            summary = f"{company.name} possui tese promissora, mas ainda exige maturação e novas confirmações."
        else:
            recommendation = "descartar"
            summary = f"{company.name} ainda não reúne evidências suficientes para avançar no pipeline."
        return ThesisResponse(
            company_id=company_id,
            summary=summary,
            rationale=rationale,
            score=score.score,
            recommendation=recommendation,
            updated_at=utcnow(),
        )

    def get_market_map(self) -> list[MarketMapEntry]:
        grouped_scores: dict[str, list[int]] = defaultdict(list)
        grouped_companies: dict[str, int] = defaultdict(int)
        for company in self.companies.list():
            grouped_companies[company.sector] += 1
            grouped_scores[company.sector].append(self.get_score(company.id).score)
        items = []
        for sector, total in grouped_companies.items():
            scores = grouped_scores[sector]
            average = round(sum(scores) / len(scores), 2) if scores else 0.0
            items.append(MarketMapEntry(sector=sector, company_count=total, average_score=average))
        return sorted(items, key=lambda item: (-item.average_score, item.sector))

    def _recalculate_score(self, company_id: str) -> ScoreSnapshot:
        company_signals = self.signals.list(company_id=company_id)
        source_diversity = min(30, len({item.source_id for item in company_signals}) * 10)
        signal_strength = min(50, sum(item.strength for item in company_signals) // 4)
        recency = 20 if company_signals else 5
        snapshot = ScoreSnapshot(
            company_id=company_id,
            score=min(100, source_diversity + signal_strength + recency),
            breakdown=ScoreBreakdown(
                source_diversity=source_diversity,
                signal_strength=signal_strength,
                recency=recency,
            ),
            calculated_at=utcnow(),
        )
        return self.scores.add(snapshot)
