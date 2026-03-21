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

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: string[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
  }

  const rawBody = chunks.join("").trim();

  if (!rawBody) {
    throw new Error("empty_body");
  }

  return JSON.parse(rawBody) as T;
}
