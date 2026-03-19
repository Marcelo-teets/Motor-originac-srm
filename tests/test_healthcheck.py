from fastapi.testclient import TestClient

from motor_originacao.main import app

client = TestClient(app)


def test_healthcheck_returns_status_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
