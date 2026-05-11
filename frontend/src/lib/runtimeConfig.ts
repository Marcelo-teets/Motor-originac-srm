const env = import.meta.env;
const configuredApiBaseUrl = env.VITE_API_BASE_URL ?? env.VITE_API_URL ?? '';

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export const API_BASE_URL = normalizeBaseUrl(configuredApiBaseUrl);

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  return API_BASE_URL ? API_BASE_URL + normalizedPath : normalizedPath;
}
