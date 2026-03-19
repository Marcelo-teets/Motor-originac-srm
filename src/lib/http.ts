import { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

export function getUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? "/", "http://localhost:3000");
}
