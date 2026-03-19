from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, status

from motor_originacao.domain.entities import SourceEntity
from motor_originacao.domain.enums import ReliabilityLevel, SourceCategory
from motor_originacao.models.source import SourceCreate
from motor_originacao.repositories.in_memory_repository import InMemoryRepository
from motor_originacao.utils.time import utcnow


SOURCE_SEED = [
    {
        "nome": "Receita Federal do Brasil",
        "categoria": SourceCategory.REGISTRY,
        "confiabilidade": ReliabilityLevel.VERY_HIGH,
        "ativa": True,
        "pais": "BR",
    },
    {
        "nome": "Comissão de Valores Mobiliários",
        "categoria": SourceCategory.REGULATORY,
        "confiabilidade": ReliabilityLevel.VERY_HIGH,
        "ativa": True,
        "pais": "BR",
    },
    {
        "nome": "Banco Central do Brasil",
        "categoria": SourceCategory.FINANCIAL,
        "confiabilidade": ReliabilityLevel.VERY_HIGH,
        "ativa": True,
        "pais": "BR",
    },
    {
        "nome": "Jusbrasil Monitor",
        "categoria": SourceCategory.LEGAL,
        "confiabilidade": ReliabilityLevel.MEDIUM,
        "ativa": True,
        "pais": "BR",
    },
    {
        "nome": "Valor Econômico",
        "categoria": SourceCategory.NEWS,
        "confiabilidade": ReliabilityLevel.HIGH,
        "ativa": True,
        "pais": "BR",
    },
    {
        "nome": "B3 Insights",
        "categoria": SourceCategory.MARKET,
        "confiabilidade": ReliabilityLevel.HIGH,
        "ativa": True,
        "pais": "BR",
    },
]


class SourceGovernanceService:
    def __init__(self, repository: InMemoryRepository) -> None:
        self.repository = repository

    def seed_defaults(self) -> None:
        if self.repository.sources:
            return
        for seed in SOURCE_SEED:
            source = SourceEntity(
                id=f"src_{uuid4().hex[:12]}",
                nome=seed["nome"],
                categoria=seed["categoria"],
                confiabilidade=seed["confiabilidade"],
                ativa=seed["ativa"],
                pais=seed["pais"],
                created_at=utcnow(),
            )
            self.repository.store_source(source)

    def list_sources(self, active_only: bool = False) -> list[SourceEntity]:
        sources = list(self.repository.sources.values())
        if active_only:
            sources = [source for source in sources if source.ativa]
        return sorted(sources, key=lambda source: source.nome)

    def create_source(self, payload: SourceCreate) -> SourceEntity:
        if any(source.nome.lower() == payload.nome.lower() for source in self.repository.sources.values()):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Fonte já cadastrada.")

        source = SourceEntity(
            id=f"src_{uuid4().hex[:12]}",
            nome=payload.nome.strip(),
            categoria=payload.categoria,
            confiabilidade=payload.confiabilidade,
            ativa=payload.ativa,
            pais=payload.pais,
            created_at=utcnow(),
        )
        return self.repository.store_source(source)

    def get_source(self, source_id: str) -> SourceEntity:
        source = self.repository.sources.get(source_id)
        if not source:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fonte não encontrada.")
        if not source.ativa:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Fonte inativa.")
        return source
