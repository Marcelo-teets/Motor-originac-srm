from __future__ import annotations

import json
import threading
from urllib.request import urlopen

from app.main import create_server
from app.schemas.ranking_v2 import CompanyRankingInput
from app.services.ranking_v2_service import RankingV2Service


def test_calculate_rankings_sorts_buckets_and_paginates() -> None:
    service = RankingV2Service()
    companies = [
        CompanyRankingInput(
            company_id="1",
            company_name="Alpha",
            current_ors_v2=95,
            previous_ors_v2=80,
            delta_ors_v2=15,
            trigger_strength=92,
            source_confidence_score=90,
            market_fit_score=94,
            priority_tier="tier_1",
        ),
        CompanyRankingInput(
            company_id="2",
            company_name="Beta",
            current_ors_v2=82,
            previous_ors_v2=70,
            delta_ors_v2=2,
            trigger_strength=76,
            source_confidence_score=80,
            market_fit_score=78,
            priority_tier="tier_2",
        ),
        CompanyRankingInput(
            company_id="3",
            company_name="Gamma",
            current_ors_v2=44,
            previous_ors_v2=55,
            delta_ors_v2=-11,
            trigger_strength=38,
            source_confidence_score=42,
            market_fit_score=40,
            priority_tier="tier_3",
        ),
    ]

    response = service.calculate_rankings(companies, page=1, page_size=2)

    assert response.pagination.total_items == 3
    assert response.pagination.total_pages == 2
    assert [item.company_name for item in response.items] == ["Alpha", "Beta"]
    assert response.items[0].delta_normalized == 100.0
    assert response.items[0].ranking_bucket == "top_priority"
    assert response.items[1].ranking_bucket == "high_priority"
    assert "Alpha ficou em top_priority" in response.items[0].ranking_reason_summary


def test_get_rankings_v2_endpoint_returns_paginated_payload() -> None:
    server = create_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        port = server.server_address[1]
        with urlopen(f"http://127.0.0.1:{port}/api/v1/rankings/v2?page=1&page_size=2") as response:
            assert response.status == 200
            payload = json.loads(response.read().decode("utf-8"))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

    assert payload["pagination"] == {
        "page": 1,
        "page_size": 2,
        "total_items": 4,
        "total_pages": 2,
    }
    assert len(payload["items"]) == 2
    assert payload["items"][0]["ranking_v2"] >= payload["items"][1]["ranking_v2"]
    assert payload["items"][0]["ranking_bucket"] in {
        "top_priority",
        "high_priority",
        "monitor_closely",
        "watchlist",
        "low_priority",
    }
