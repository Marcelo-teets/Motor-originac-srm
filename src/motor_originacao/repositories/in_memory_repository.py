from __future__ import annotations

from collections import defaultdict
from typing import Dict, List

from motor_originacao.domain.entities import (
    CompanyEntity,
    MarketMapCardEntity,
    ScoreSnapshotEntity,
    SignalEntity,
    SourceEntity,
    ThesisEntity,
)


class InMemoryRepository:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.companies: Dict[str, CompanyEntity] = {}
        self.company_ids_by_cnpj: Dict[str, str] = {}
        self.company_ids_by_normalized_name: Dict[str, str] = {}
        self.sources: Dict[str, SourceEntity] = {}
        self.signals: Dict[str, SignalEntity] = {}
        self.signals_by_company: defaultdict[str, List[str]] = defaultdict(list)
        self.score_history: defaultdict[str, List[ScoreSnapshotEntity]] = defaultdict(list)
        self.theses_by_company: Dict[str, ThesisEntity] = {}
        self.market_map_by_company: Dict[str, MarketMapCardEntity] = {}

    def store_company(self, company: CompanyEntity) -> CompanyEntity:
        self.companies[company.id] = company
        self.company_ids_by_normalized_name[company.normalized_nome] = company.id
        if company.normalized_cnpj:
            self.company_ids_by_cnpj[company.normalized_cnpj] = company.id
        return company

    def store_source(self, source: SourceEntity) -> SourceEntity:
        self.sources[source.id] = source
        return source

    def store_signal(self, signal: SignalEntity) -> SignalEntity:
        self.signals[signal.id] = signal
        self.signals_by_company[signal.company_id].append(signal.id)
        return signal

    def store_score_snapshot(self, snapshot: ScoreSnapshotEntity) -> ScoreSnapshotEntity:
        self.score_history[snapshot.company_id].append(snapshot)
        return snapshot

    def store_thesis(self, thesis: ThesisEntity) -> ThesisEntity:
        self.theses_by_company[thesis.company_id] = thesis
        return thesis

    def store_market_map(self, card: MarketMapCardEntity) -> MarketMapCardEntity:
        self.market_map_by_company[card.company_id] = card
        return card


repository = InMemoryRepository()
