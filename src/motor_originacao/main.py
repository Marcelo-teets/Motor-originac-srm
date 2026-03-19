from contextlib import contextmanager

from fastapi import FastAPI

from motor_originacao.api.routes_copilot import router as copilot_router
from motor_originacao.api.routes_companies import router as companies_router
from motor_originacao.api.routes_health import router as health_router
from motor_originacao.api.routes_market_map import router as market_map_router
from motor_originacao.api.routes_scores import router as scores_router
from motor_originacao.api.routes_signals import router as signals_router
from motor_originacao.api.routes_sources import router as sources_router
from motor_originacao.api.routes_thesis import router as thesis_router
from motor_originacao.config import settings
from motor_originacao.services.app_state import reset_state


@contextmanager
def lifespan(_: FastAPI):
    reset_state()
    yield


app = FastAPI(
    title=settings.app_name,
    debug=settings.app_debug,
    version="0.1.0",
    summary="Motor inicial de originação, monitoramento e tese para SRM.",
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(companies_router)
app.include_router(sources_router)
app.include_router(signals_router)
app.include_router(scores_router)
app.include_router(thesis_router)
app.include_router(market_map_router)
app.include_router(copilot_router)
