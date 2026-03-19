from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, status

from motor_originacao.domain.entities import CompanyEntity
from motor_originacao.models.company import CompanyCreate
from motor_originacao.repositories.in_memory_repository import InMemoryRepository
from motor_originacao.utils.normalization import normalize_cnpj, normalize_name
from motor_originacao.utils.time import utcnow


class EntityResolutionService:
    def __init__(self, repository: InMemoryRepository) -> None:
        self.repository = repository

    def create_or_resolve_company(self, payload: CompanyCreate) -> CompanyEntity:
        normalized_name = normalize_name(payload.nome)
        normalized_cnpj = normalize_cnpj(payload.cnpj)

        if normalized_cnpj:
            existing_id = self.repository.company_ids_by_cnpj.get(normalized_cnpj)
            if existing_id:
                return self.repository.companies[existing_id]

        existing_by_name = self.repository.company_ids_by_normalized_name.get(normalized_name)
        if existing_by_name:
            return self.repository.companies[existing_by_name]

        now = utcnow()
        company = CompanyEntity(
            id=f"cmp_{uuid4().hex[:12]}",
            nome=payload.nome.strip(),
            normalized_nome=normalized_name,
            cnpj=payload.cnpj,
            normalized_cnpj=normalized_cnpj,
            created_at=now,
            updated_at=now,
        )
        return self.repository.store_company(company)

    def get_company(self, company_id: str) -> CompanyEntity:
        company = self.repository.companies.get(company_id)
        if not company:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa não encontrada.")
        return company

    def list_companies(self, nome: str | None = None, cnpj: str | None = None) -> list[CompanyEntity]:
        companies = list(self.repository.companies.values())
        if nome:
            normalized_name = normalize_name(nome)
            companies = [company for company in companies if normalized_name in company.normalized_nome]
        if cnpj:
            normalized_cnpj = normalize_cnpj(cnpj)
            companies = [company for company in companies if company.normalized_cnpj == normalized_cnpj]
        return sorted(companies, key=lambda company: company.created_at)
