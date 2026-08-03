import { PRODUCTION_API_BASE_URL } from './productionApiBase';

const env = import.meta.env;
const configuredApiBaseUrl = env.VITE_API_BASE_URL ?? env.VITE_API_URL ?? '';

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function resolveApiBaseUrl(): string {
  // Produção usa sempre a API consolidada do mesmo domínio. Isso evita que
  // variáveis antigas da Vercel apontem o navegador para outro hostname,
  // disparem preflight CORS e bloqueiem o Company Master quality gate.
  if (env.PROD) return PRODUCTION_API_BASE_URL;

  return normalizeBaseUrl(configuredApiBaseUrl);
}

export const API_BASE_URL = resolveApiBaseUrl();

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  return API_BASE_URL ? API_BASE_URL + normalizedPath : normalizedPath;
}
