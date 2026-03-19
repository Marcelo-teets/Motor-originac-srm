from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    app_name: str = 'Motor Originação SRM API'
    api_prefix: str = '/api/v1'


@lru_cache
def get_settings() -> Settings:
    return Settings()
