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
        self.signal_ids_by_fingerprint: Dict[str, str] = {}
        self.score_history: defaultdict[str, List[ScoreSnapshotEntity]] = defaultdict(list)
        self.theses_by_company: Dict[str, ThesisEntity] = {}
        self.market_map_by_company: Dict[str, MarketMapCardEntity] = {}

    def get_company_by_id(self, company_id: str) -> CompanyEntity | None:
        return self.companies.get(company_id)

    def get_company_by_cnpj(self, normalized_cnpj: str | None) -> CompanyEntity | None:
        if not normalized_cnpj:
            return None
        company_id = self.company_ids_by_cnpj.get(normalized_cnpj)
        return self.companies.get(company_id) if company_id else None

    def get_company_by_normalized_name(self, normalized_name: str) -> CompanyEntity | None:
        company_id = self.company_ids_by_normalized_name.get(normalized_name)
        return self.companies.get(company_id) if company_id else None

    def store_company(self, company: CompanyEntity) -> CompanyEntity:
        self.companies[company.id] = company
        self.company_ids_by_normalized_name[company.normalized_nome] = company.id
        if company.normalized_cnpj:
            self.company_ids_by_cnpj[company.normalized_cnpj] = company.id
        return company

    def list_companies(self) -> list[CompanyEntity]:
        return list(self.companies.values())

    def store_source(self, source: SourceEntity) -> SourceEntity:
        self.sources[source.id] = source
        return source

    def list_sources(self) -> list[SourceEntity]:
        return list(self.sources.values())

    def store_signal(self, signal: SignalEntity) -> SignalEntity:
        self.signals[signal.id] = signal
        self.signals_by_company[signal.company_id].append(signal.id)
        return signal

    def get_signal(self, signal_id: str) -> SignalEntity | None:
        return self.signals.get(signal_id)

    def list_signals(self) -> list[SignalEntity]:
        return list(self.signals.values())

    def list_company_signals(self, company_id: str) -> list[SignalEntity]:
        return [self.signals[signal_id] for signal_id in self.signals_by_company.get(company_id, [])]

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
