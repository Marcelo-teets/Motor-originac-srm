from app.services.score_history_service import ScoreHistoryService
from app.services.thesis_service import ThesisService


def test_thesis_generation_persists_output(db_session) -> None:
    score_history = ScoreHistoryService(db_session).create_snapshot(company_id=1, score_delta=58.0)
    thesis = ThesisService(db_session).generate_and_persist(company_id=1, investment_context="Capital rotation supports proactive origination")

    latest = ThesisService(db_session).latest(company_id=1)

    assert thesis.id == latest.id
    assert latest.company_id == 1
    assert "Northwind Infra" in latest.headline
    assert latest.why_now_json[1].endswith(f"{score_history.ranking_v2:.1f} indicates near-term momentum")
