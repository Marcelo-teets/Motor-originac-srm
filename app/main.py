from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from app.schemas.ranking_v2 import CompanyRankingInput, RankingV2Response
from app.services.ranking_v2_service import RankingV2Service

service = RankingV2Service()

SAMPLE_COMPANIES: list[CompanyRankingInput] = [
    CompanyRankingInput(
        company_id="c001",
        company_name="Atlas Logistics",
        current_ors_v2=92,
        previous_ors_v2=81,
        delta_ors_v2=11,
        trigger_strength=88,
        source_confidence_score=90,
        market_fit_score=85,
        priority_tier="tier_1",
    ),
    CompanyRankingInput(
        company_id="c002",
        company_name="Beacon Health",
        current_ors_v2=76,
        previous_ors_v2=71,
        delta_ors_v2=5,
        trigger_strength=72,
        source_confidence_score=80,
        market_fit_score=74,
        priority_tier="tier_2",
    ),
    CompanyRankingInput(
        company_id="c003",
        company_name="Cascade Retail",
        current_ors_v2=58,
        previous_ors_v2=64,
        delta_ors_v2=-6,
        trigger_strength=60,
        source_confidence_score=55,
        market_fit_score=63,
        priority_tier="tier_3",
    ),
    CompanyRankingInput(
        company_id="c004",
        company_name="Drift Energy",
        current_ors_v2=43,
        previous_ors_v2=40,
        delta_ors_v2=3,
        trigger_strength=47,
        source_confidence_score=52,
        market_fit_score=48,
        priority_tier="tier_3",
    ),
]


def get_rankings_v2(page: int = 1, page_size: int = 10) -> RankingV2Response:
    return service.calculate_rankings(SAMPLE_COMPANIES, page=page, page_size=page_size)


class RankingAPIHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        parsed_url = urlparse(self.path)
        if parsed_url.path != "/api/v1/rankings/v2":
            self._write_json({"detail": "Not Found"}, status=HTTPStatus.NOT_FOUND)
            return

        query = parse_qs(parsed_url.query)
        try:
            page = int(query.get("page", [1])[0])
            page_size = int(query.get("page_size", [10])[0])
            payload = get_rankings_v2(page=page, page_size=page_size).to_dict()
        except ValueError as error:
            self._write_json({"detail": str(error)}, status=HTTPStatus.BAD_REQUEST)
            return

        self._write_json(payload)

    def log_message(self, format: str, *args: object) -> None:
        return

    def _write_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def create_server(host: str = "127.0.0.1", port: int = 8000) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), RankingAPIHandler)


if __name__ == "__main__":
    server = create_server()
    print("Serving Origination Intelligence Platform at http://127.0.0.1:8000")
    server.serve_forever()
