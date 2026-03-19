import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from motor_originacao.main import app
from motor_originacao.services.app_state import reset_state


@pytest.fixture()
def client() -> TestClient:
    reset_state()
    with TestClient(app) as test_client:
        yield test_client
