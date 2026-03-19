from dataclasses import dataclass
from functools import lru_cache
import os

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_name: str = "Motor Originação SRM"
    app_env: str = "development"
    app_port: int = 8000
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", Settings.app_name),
        app_env=os.getenv("APP_ENV", Settings.app_env),
        app_port=int(os.getenv("APP_PORT", str(Settings.app_port))),
        log_level=os.getenv("LOG_LEVEL", Settings.log_level),
    )
