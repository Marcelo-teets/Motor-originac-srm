from dataclasses import dataclass


@dataclass
class RankingInputs:
    current_ors_v2: float
    score_trend_delta_normalized: float
    trigger_strength: float
    source_confidence_score: float
    market_fit_score: float


class RankingV2Service:
    def calculate(self, payload: RankingInputs) -> float:
        ranking_v2 = (
            (payload.current_ors_v2 * 0.35)
            + (payload.score_trend_delta_normalized * 0.15)
            + (payload.trigger_strength * 0.20)
            + (payload.source_confidence_score * 0.15)
            + (payload.market_fit_score * 0.15)
        )
        return round(ranking_v2, 4)

    def tier(self, ranking_v2: float) -> str:
        if ranking_v2 >= 80:
            return "Tier 1"
        if ranking_v2 >= 65:
            return "Tier 2"
        return "Tier 3"
