from fastapi import FastAPI

from app.api.routes import entity_resolution, market_map, monitoring, orchestration, rankings, score_history, source_governance, thesis
from app.db.base import Base
from app.db.session import engine, SessionLocal
from app.repositories.company_repository import CompanyRepository

app = FastAPI(title="Origination Intelligence Platform V7")

Base.metadata.create_all(bind=engine)
with SessionLocal() as session:
    CompanyRepository(session).seed_defaults()

app.include_router(entity_resolution.router)
app.include_router(source_governance.router)
app.include_router(thesis.router)
app.include_router(market_map.router)
app.include_router(score_history.router)
app.include_router(orchestration.router)
app.include_router(rankings.router)
app.include_router(monitoring.router)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok", "service": "origination-intelligence-platform-v7"}
