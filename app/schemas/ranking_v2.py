from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

RankingBucket = Literal[
    "top_priority",
    "high_priority",
    "monitor_closely",
    "watchlist",
    "low_priority",
]


@dataclass(slots=True)
class CompanyRankingInput:
    company_id: str
    company_name: str
    current_ors_v2: float
    previous_ors_v2: float
    delta_ors_v2: float
    trigger_strength: float
    source_confidence_score: float
    market_fit_score: float
    priority_tier: str


@dataclass(slots=True)
class CompanyRankingV2:
    company_id: str
    company_name: str
    current_ors_v2: float
    previous_ors_v2: float
    delta_ors_v2: float
    delta_normalized: float
    trigger_strength: float
    source_confidence_score: float
    market_fit_score: float
    priority_tier: str
    ranking_v2: float
    ranking_bucket: RankingBucket
    ranking_reason_summary: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(slots=True)
class PaginationMeta:
    page: int
    page_size: int
    total_items: int
    total_pages: int

    def to_dict(self) -> dict[str, int]:
        return asdict(self)


@dataclass(slots=True)
class RankingV2Response:
    items: list[CompanyRankingV2]
    pagination: PaginationMeta

    def to_dict(self) -> dict[str, object]:
        return {
            "items": [item.to_dict() for item in self.items],
            "pagination": self.pagination.to_dict(),
        }
