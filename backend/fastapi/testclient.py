from __future__ import annotations

import inspect
import re
from dataclasses import asdict, is_dataclass
from datetime import datetime
from typing import Any

from fastapi import HTTPException


class Response:
    def __init__(self, status_code: int, payload: Any) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> Any:
        return self._payload


class TestClient:
    __test__ = False
    def __init__(self, app) -> None:
        self.app = app

    def get(self, path: str) -> Response:
        return self._request('GET', path, None)

    def post(self, path: str, json: dict[str, Any] | None = None) -> Response:
        return self._request('POST', path, json or {})

    def _request(self, method: str, path: str, payload: dict[str, Any] | None) -> Response:
        clean_path, _, query = path.partition('?')
        query_params = {}
        if query:
            for chunk in query.split('&'):
                key, _, value = chunk.partition('=')
                query_params[key] = value
        for route in self.app.routes:
            params = self._match(route.path, clean_path)
            if route.method == method and params is not None:
                try:
                    kwargs = self._build_kwargs(route.endpoint, params, query_params, payload)
                    result = route.endpoint(**kwargs)
                    status = getattr(route.endpoint, '_status_code', 200)
                    return Response(status, self._serialize(result))
                except HTTPException as exc:
                    return Response(exc.status_code, {'detail': exc.detail})
                except Exception as exc:
                    return Response(422, {'detail': str(exc)})
        return Response(404, {'detail': 'not found'})

    def _match(self, pattern: str, path: str):
        regex = re.sub(r'\{([^}]+)\}', r'(?P<\1>[^/]+)', pattern)
        match = re.fullmatch(regex, path)
        return match.groupdict() if match else None

    def _build_kwargs(self, endpoint, path_params, query_params, payload):
        kwargs = {}
        signature = inspect.signature(endpoint)
        for name in signature.parameters:
            if name in path_params:
                kwargs[name] = path_params[name]
            elif name in query_params:
                kwargs[name] = query_params[name]
            elif payload is not None:
                kwargs[name] = payload
        return kwargs

    def _serialize(self, value: Any):
        if hasattr(value, 'to_dict'):
            return value.to_dict()
        if isinstance(value, list):
            return [self._serialize(item) for item in value]
        if isinstance(value, dict):
            return {key: self._serialize(item) for key, item in value.items()}
        if is_dataclass(value):
            data = asdict(value)
            return self._serialize(data)
        if isinstance(value, datetime):
            return value.isoformat()
        return value
