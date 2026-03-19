from fastapi import FastAPI

from motor_originacao.api.routes import router
from motor_originacao.config import get_settings
from motor_originacao.core.logger import configure_logging

settings = get_settings()
configure_logging(settings.log_level)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="API inicial do Motor Originação SRM.",
)
app.include_router(router)
