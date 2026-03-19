from __future__ import annotations

import inspect
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, get_args, get_origin

from pydantic import BaseModel


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class status:
    HTTP_404_NOT_FOUND = 404
    HTTP_409_CONFLICT = 409
    HTTP_422_UNPROCESSABLE_ENTITY = 422


@dataclass(slots=True)
class QueryValue:
    default: Any = None


def Query(default: Any = None):
    return QueryValue(default=default)


@dataclass(slots=True)
class Route:
    method: str
    path: str
    endpoint: Callable[..., Any]
    status_code: int = 200


class APIRouter:
    def __init__(self, prefix: str = "", tags: list[str] | None = None) -> None:
        self.prefix = prefix
        self.tags = tags or []
        self.routes: list[Route] = []

    def add_api_route(self, path: str, endpoint: Callable[..., Any], method: str, status_code: int = 200, **_: Any):
        self.routes.append(Route(method=method.upper(), path=f"{self.prefix}{path}", endpoint=endpoint, status_code=status_code))
        return endpoint

    def get(self, path: str, **kwargs: Any):
        status_code = kwargs.pop("status_code", 200)
        return lambda func: self.add_api_route(path, func, "GET", status_code, **kwargs)

    def post(self, path: str, **kwargs: Any):
        status_code = kwargs.pop("status_code", 200)
        return lambda func: self.add_api_route(path, func, "POST", status_code, **kwargs)


class FastAPI:
    def __init__(self, *, title: str, debug: bool, version: str, summary: str, lifespan: Callable[..., AbstractAsyncContextManager] | None = None) -> None:
        self.title = title
        self.debug = debug
        self.version = version
        self.summary = summary
        self.lifespan_factory = lifespan
        self.routes: list[Route] = []
        self.state: dict[str, Any] = {}

    def include_router(self, router: APIRouter) -> None:
        self.routes.extend(router.routes)

    def _startup(self):
        if self.lifespan_factory:
            self._lifespan = self.lifespan_factory(self)
            self._lifespan.__enter__()

    def _shutdown(self):
        if getattr(self, "_lifespan", None):
            self._lifespan.__exit__(None, None, None)
            self._lifespan = None

    def handle_request(self, method: str, path: str, json_body: dict[str, Any] | None = None, query_params: dict[str, Any] | None = None):
        query_params = query_params or {}
        for route in self.routes:
            params = match_path(route.path, path)
            if route.method == method.upper() and params is not None:
                try:
                    result = call_endpoint(route.endpoint, params, query_params, json_body or {})
                except HTTPException as exc:
                    return Response(exc.status_code, {"detail": exc.detail})
                except Exception as exc:
                    return Response(500, {"detail": str(exc)})
                body = serialize_result(result)
                return Response(route.status_code, body)
        return Response(404, {"detail": "Not found"})


class Response:
    def __init__(self, status_code: int, payload: Any) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Any:
        return self._payload


class TestClient:
    def __init__(self, app: FastAPI) -> None:
        self.app = app

    def __enter__(self):
        self.app._startup()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.app._shutdown()

    def get(self, path: str):
        pure_path, query_params = split_query(path)
        return self.app.handle_request("GET", pure_path, query_params=query_params)

    def post(self, path: str, json: dict[str, Any] | None = None):
        pure_path, query_params = split_query(path)
        return self.app.handle_request("POST", pure_path, json_body=json, query_params=query_params)


def split_query(path: str) -> tuple[str, dict[str, str]]:
    if "?" not in path:
        return path, {}
    pure_path, raw_query = path.split("?", 1)
    params = {}
    for pair in raw_query.split("&"):
        if not pair:
            continue
        key, _, value = pair.partition("=")
        params[key] = value
    return pure_path, params


def match_path(route_path: str, request_path: str) -> dict[str, str] | None:
    route_parts = [part for part in route_path.split('/') if part]
    request_parts = [part for part in request_path.split('/') if part]
    if len(route_parts) != len(request_parts):
        return None
    params = {}
    for route_part, request_part in zip(route_parts, request_parts):
        if route_part.startswith('{') and route_part.endswith('}'):
            params[route_part[1:-1]] = request_part
        elif route_part != request_part:
            return None
    return params


def call_endpoint(endpoint: Callable[..., Any], path_params: dict[str, str], query_params: dict[str, Any], body: dict[str, Any]):
    kwargs = {}
    sig = inspect.signature(endpoint)
    for name, parameter in sig.parameters.items():
        annotation = parameter.annotation
        default = parameter.default
        if name in path_params:
            kwargs[name] = cast_value(annotation, path_params[name])
        elif isinstance(default, QueryValue):
            value = query_params.get(name, default.default)
            kwargs[name] = cast_value(annotation, value)
        elif is_basemodel(annotation):
            kwargs[name] = annotation(**body)
        elif name in body:
            kwargs[name] = cast_value(annotation, body[name])
        elif default is not inspect._empty:
            kwargs[name] = default
        else:
            raise TypeError(f"Missing argument {name}")
    return endpoint(**kwargs)


def is_basemodel(annotation: Any) -> bool:
    return isinstance(annotation, type) and issubclass(annotation, BaseModel)


def cast_value(annotation: Any, value: Any) -> Any:
    if value is None:
        return None
    origin = get_origin(annotation)
    args = get_args(annotation)
    if origin is None:
        if isinstance(annotation, type) and issubclass(annotation, Enum):
            return annotation(value)
        if annotation in {str, int, float, bool} and not isinstance(value, annotation):
            if annotation is bool and isinstance(value, str):
                return value.lower() in {"1", "true", "yes", "on"}
            return annotation(value)
        return value
    if str(origin) in {"types.UnionType", "<class 'types.UnionType'>"} or origin is getattr(__import__('typing'), 'Union', None):
        non_none = [arg for arg in args if arg is not type(None)]
        if value is None:
            return None
        return cast_value(non_none[0], value) if non_none else value
    return value


def serialize_result(result: Any) -> Any:
    if isinstance(result, BaseModel):
        return result.model_dump()
    if isinstance(result, list):
        return [serialize_result(item) for item in result]
    if hasattr(result, '__dict__'):
        return {key: serialize_result(value) for key, value in result.__dict__.items()}
    return result
