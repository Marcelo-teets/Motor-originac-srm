import os
from dataclasses import dataclass


@dataclass(slots=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Motor Originação SRM")
    app_env: str = os.getenv("APP_ENV", "development")
    app_debug: bool = os.getenv("APP_DEBUG", "true").lower() in {"1", "true", "yes", "on"}
    api_prefix: str = os.getenv("API_PREFIX", "")


settings = Settings()
