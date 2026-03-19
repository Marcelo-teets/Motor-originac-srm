import os
import sys
from collections.abc import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.base import Base
from app.models import Company  # noqa: E402


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite:///:memory:", future=True)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        session.add(
            Company(
                name="Northwind Infra",
                sector="energy transition",
                current_ors_v2=82.0,
                source_confidence_score=76.0,
                market_fit_score=71.0,
                trigger_strength=69.0,
            )
        )
        session.commit()
        yield session
