from app.services.ranking_v2_service import RankingInputs, RankingV2Service


def test_ranking_v2_formula_matches_expected_weights() -> None:
    service = RankingV2Service()
    result = service.calculate(
        RankingInputs(
            current_ors_v2=80.0,
            score_trend_delta_normalized=50.0,
            trigger_strength=70.0,
            source_confidence_score=60.0,
            market_fit_score=90.0,
        )
    )
    assert result == 72.0
    assert service.tier(result) == "Tier 2"
