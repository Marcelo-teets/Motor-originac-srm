from __future__ import annotations

from fastapi import HTTPException, status

from motor_originacao.domain.entities import CompanyEntity
from motor_originacao.models.company import CompanyCreate
from motor_originacao.repositories.in_memory_repository import InMemoryRepository
from motor_originacao.utils.identity import build_deterministic_id
from motor_originacao.utils.normalization import normalize_cnpj, normalize_name
from motor_originacao.utils.time import utcnow


class EntityResolutionService:
    def __init__(self, repository: InMemoryRepository) -> None:
        self.repository = repository

    def create_or_resolve_company(self, payload: CompanyCreate) -> CompanyEntity:
        normalized_name = normalize_name(payload.nome)
        normalized_cnpj = normalize_cnpj(payload.cnpj)

        existing_by_cnpj = self.repository.get_company_by_cnpj(normalized_cnpj)
        if existing_by_cnpj:
            return existing_by_cnpj

        existing_by_name = self.repository.get_company_by_normalized_name(normalized_name)
        if existing_by_name:
            if normalized_cnpj and not existing_by_name.normalized_cnpj:
                now = utcnow()
                existing_by_name.cnpj = payload.cnpj
                existing_by_name.normalized_cnpj = normalized_cnpj
                existing_by_name.updated_at = now
                self.repository.store_company(existing_by_name)
            return existing_by_name

        now = utcnow()
        identity_key = normalized_cnpj or normalized_name
        company = CompanyEntity(
            id=build_deterministic_id("cmp", identity_key),
            nome=payload.nome.strip(),
            normalized_nome=normalized_name,
            cnpj=payload.cnpj,
            normalized_cnpj=normalized_cnpj,
            created_at=now,
            updated_at=now,
        )
        return self.repository.store_company(company)

    def get_company(self, company_id: str) -> CompanyEntity:
        company = self.repository.get_company_by_id(company_id)
        if not company:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa não encontrada.")
        return company

    def list_companies(self, nome: str | None = None, cnpj: str | None = None) -> list[CompanyEntity]:
        companies = self.repository.list_companies()
        if nome:
            normalized_name = normalize_name(nome)
            companies = [company for company in companies if normalized_name in company.normalized_nome]
        if cnpj:
            normalized_cnpj = normalize_cnpj(cnpj)
            companies = [company for company in companies if company.normalized_cnpj == normalized_cnpj]
        return sorted(companies, key=lambda company: company.created_at)
