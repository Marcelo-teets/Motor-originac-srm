from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def Query(default=None):
    return default


@dataclass
class Route:
    method: str
    path: str
    endpoint: Callable[..., Any]


class APIRouter:
    def __init__(self) -> None:
        self.routes: list[Route] = []

    def get(self, path: str, response_model=None):
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            self.routes.append(Route('GET', path, func))
            return func
        return decorator

    def post(self, path: str, status_code: int = 200):
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            func._status_code = status_code
            self.routes.append(Route('POST', path, func))
            return func
        return decorator


class FastAPI:
    def __init__(self, title: str = 'App') -> None:
        self.title = title
        self.routes: list[Route] = []

    def add_middleware(self, *args, **kwargs) -> None:  # pragma: no cover
        return None

    def include_router(self, router: APIRouter, prefix: str = '') -> None:
        for route in router.routes:
            self.routes.append(Route(route.method, f'{prefix}{route.path}', route.endpoint))
