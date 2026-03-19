from functools import lru_cache
import os

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    app_name: str = Field(default="Motor Originação SRM")
    app_env: str = Field(default="development")
    app_port: int = Field(default=8000)
    log_level: str = Field(default="INFO")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "Motor Originação SRM"),
        app_env=os.getenv("APP_ENV", "development"),
        app_port=int(os.getenv("APP_PORT", "8000")),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )
