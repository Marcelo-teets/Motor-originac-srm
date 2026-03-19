from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs
from wsgiref.simple_server import make_server

from app.main import app
from fastapi.testclient import TestClient


client = TestClient(app)


def application(environ, start_response):
    method = environ['REQUEST_METHOD']
    path = environ.get('PATH_INFO', '')
    query = environ.get('QUERY_STRING', '')
    content_length = int(environ.get('CONTENT_LENGTH') or 0)
    body_bytes = environ['wsgi.input'].read(content_length) if content_length else b''
    payload: dict[str, Any] | None = None
    if body_bytes:
        payload = json.loads(body_bytes.decode('utf-8'))
    if query:
        path = f"{path}?{query}"

    if method == 'GET':
        response = client.get(path)
    elif method == 'POST':
        response = client.post(path, json=payload)
    else:
        response = type('Resp', (), {'status_code': 405, 'json': lambda self: {'detail': 'method not allowed'}})()

    body = json.dumps(response.json()).encode('utf-8')
    status_text = {200: 'OK', 201: 'Created', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Entity'}
    start_response(f"{response.status_code} {status_text.get(response.status_code, 'OK')}", [('Content-Type', 'application/json'), ('Content-Length', str(len(body)))])
    return [body]


if __name__ == '__main__':
    with make_server('0.0.0.0', 8000, application) as server:
        print('Serving Motor Originação SRM backend on http://0.0.0.0:8000')
        server.serve_forever()
