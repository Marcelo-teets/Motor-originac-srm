from __future__ import annotations

import math
from collections.abc import Sequence

from app.schemas.ranking_v2 import CompanyRankingInput, CompanyRankingV2, PaginationMeta, RankingBucket, RankingV2Response


class RankingV2Service:
    """Calculates dynamic company rankings for the Origination Intelligence Platform."""

    _BUCKET_RULES: tuple[tuple[int, RankingBucket], ...] = (
        (85, "top_priority"),
        (70, "high_priority"),
        (55, "monitor_closely"),
        (40, "watchlist"),
        (0, "low_priority"),
    )

    def calculate_rankings(
        self,
        companies: Sequence[CompanyRankingInput],
        *,
        page: int = 1,
        page_size: int = 10,
    ) -> RankingV2Response:
        if page < 1:
            raise ValueError("page must be greater than or equal to 1")
        if page_size < 1:
            raise ValueError("page_size must be greater than or equal to 1")

        deltas = [company.delta_ors_v2 for company in companies]
        normalized_deltas = self._normalize_deltas(deltas)

        rankings = [
            self._build_ranking(company, normalized_deltas[index])
            for index, company in enumerate(companies)
        ]
        rankings.sort(key=lambda ranking: ranking.ranking_v2, reverse=True)

        total_items = len(rankings)
        total_pages = math.ceil(total_items / page_size) if total_items else 0
        start = (page - 1) * page_size
        end = start + page_size
        paginated_items = rankings[start:end]

        return RankingV2Response(
            items=paginated_items,
            pagination=PaginationMeta(
                page=page,
                page_size=page_size,
                total_items=total_items,
                total_pages=total_pages,
            ),
        )

    def _normalize_deltas(self, deltas: Sequence[float]) -> list[float]:
        if not deltas:
            return []

        minimum = min(deltas)
        maximum = max(deltas)
        if math.isclose(minimum, maximum):
            baseline = 50.0
            if maximum > 0:
                baseline = 100.0
            elif maximum < 0:
                baseline = 0.0
            return [baseline for _ in deltas]

        return [round(((delta - minimum) / (maximum - minimum)) * 100, 2) for delta in deltas]

    def _build_ranking(self, company: CompanyRankingInput, delta_normalized: float) -> CompanyRankingV2:
        ranking_v2 = round(
            (company.current_ors_v2 * 0.35)
            + (delta_normalized * 0.15)
            + (company.trigger_strength * 0.20)
            + (company.source_confidence_score * 0.15)
            + (company.market_fit_score * 0.15),
            2,
        )
        bucket = self._bucket_for_score(ranking_v2)

        return CompanyRankingV2(
            company_id=company.company_id,
            company_name=company.company_name,
            current_ors_v2=company.current_ors_v2,
            previous_ors_v2=company.previous_ors_v2,
            delta_ors_v2=company.delta_ors_v2,
            delta_normalized=delta_normalized,
            trigger_strength=company.trigger_strength,
            source_confidence_score=company.source_confidence_score,
            market_fit_score=company.market_fit_score,
            priority_tier=company.priority_tier,
            ranking_v2=ranking_v2,
            ranking_bucket=bucket,
            ranking_reason_summary=self._build_reason_summary(company, ranking_v2, delta_normalized, bucket),
        )

    def _bucket_for_score(self, score: float) -> RankingBucket:
        for threshold, bucket in self._BUCKET_RULES:
            if score >= threshold:
                return bucket
        return "low_priority"

    def _build_reason_summary(
        self,
        company: CompanyRankingInput,
        ranking_v2: float,
        delta_normalized: float,
        bucket: RankingBucket,
    ) -> str:
        factors = [
            ("current ORS", company.current_ors_v2),
            ("delta normalized", delta_normalized),
            ("trigger strength", company.trigger_strength),
            ("source confidence", company.source_confidence_score),
            ("market fit", company.market_fit_score),
        ]
        top_factors = ", ".join(
            f"{label} {value:.1f}" for label, value in sorted(factors, key=lambda item: item[1], reverse=True)[:3]
        )
        return (
            f"{company.company_name} ficou em {bucket} com ranking {ranking_v2:.2f}, "
            f"impulsionado por {top_factors} e prioridade {company.priority_tier}."
        )
