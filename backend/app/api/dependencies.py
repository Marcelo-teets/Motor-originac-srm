from functools import lru_cache

from app.repositories.memory import CompanyRepository, ScoreRepository, SignalRepository, SourceRepository
from app.services.origination import OriginationService


@lru_cache
def get_service() -> OriginationService:
    return OriginationService(
        sources=SourceRepository(),
        companies=CompanyRepository(),
        signals=SignalRepository(),
        scores=ScoreRepository(),
    )
