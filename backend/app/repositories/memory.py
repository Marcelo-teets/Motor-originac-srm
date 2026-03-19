from __future__ import annotations

from collections import defaultdict
from uuid import uuid4

from app.domain.models import Company, CompanyCreate, Signal, SignalCreate, Source, ScoreSnapshot, normalize_name, utcnow


class DuplicateCompanyError(ValueError):
    pass


class NotFoundError(LookupError):
    pass


class SourceRepository:
    def __init__(self) -> None:
        self._items = [
            Source(id='cvm', name='CVM', category='regulator', reliability=5),
            Source(id='b3', name='B3', category='market', reliability=5),
            Source(id='bacen', name='Banco Central', category='regulator', reliability=5),
            Source(id='receita', name='Receita Federal', category='fiscal', reliability=4),
            Source(id='diario-oficial', name='Diário Oficial', category='public-record', reliability=4),
        ]

    def list(self, category: str | None = None, active_only: bool = True) -> list[Source]:
        items = self._items
        if category:
            items = [item for item in items if item.category == category]
        if active_only:
            items = [item for item in items if item.active]
        return items

    def exists(self, source_id: str) -> bool:
        return any(item.id == source_id for item in self._items)


class CompanyRepository:
    def __init__(self) -> None:
        self._items: dict[str, Company] = {}
        self._cnpj_index: dict[str, str] = {}
        self._normalized_name_index: dict[str, str] = {}

    def create(self, payload: CompanyCreate) -> Company:
        normalized_name = normalize_name(payload.name)
        if payload.cnpj and payload.cnpj in self._cnpj_index:
            raise DuplicateCompanyError('company already exists for cnpj')
        if normalized_name in self._normalized_name_index:
            raise DuplicateCompanyError('company already exists for normalized name')
        company = Company(
            id=str(uuid4()),
            name=payload.name,
            normalized_name=normalized_name,
            cnpj=payload.cnpj,
            sector=payload.sector,
            stage=payload.stage,
            created_at=utcnow(),
        )
        self._items[company.id] = company
        if company.cnpj:
            self._cnpj_index[company.cnpj] = company.id
        self._normalized_name_index[company.normalized_name] = company.id
        return company

    def list(self, sector: str | None = None, stage: str | None = None) -> list[Company]:
        items = list(self._items.values())
        if sector:
            items = [item for item in items if item.sector == sector]
        if stage:
            items = [item for item in items if item.stage == stage]
        return sorted(items, key=lambda item: item.created_at, reverse=True)

    def get(self, company_id: str) -> Company:
        company = self._items.get(company_id)
        if not company:
            raise NotFoundError('company not found')
        return company


class SignalRepository:
    def __init__(self) -> None:
        self._items: dict[str, Signal] = {}
        self._by_company: dict[str, list[str]] = defaultdict(list)

    def create(self, payload: SignalCreate) -> Signal:
        signal = Signal(id=str(uuid4()), created_at=utcnow(), **payload.__dict__)
        self._items[signal.id] = signal
        self._by_company[signal.company_id].append(signal.id)
        return signal

    def list(self, company_id: str | None = None) -> list[Signal]:
        if company_id:
            ids = self._by_company.get(company_id, [])
            return [self._items[item_id] for item_id in ids]
        return list(self._items.values())


class ScoreRepository:
    def __init__(self) -> None:
        self._history: dict[str, list[ScoreSnapshot]] = defaultdict(list)

    def add(self, snapshot: ScoreSnapshot) -> ScoreSnapshot:
        self._history[snapshot.company_id].append(snapshot)
        return snapshot

    def current(self, company_id: str) -> ScoreSnapshot | None:
        history = self._history.get(company_id, [])
        return history[-1] if history else None

    def history(self, company_id: str) -> list[ScoreSnapshot]:
        return self._history.get(company_id, [])
