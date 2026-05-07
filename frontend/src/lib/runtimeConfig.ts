export const API_BASE_URL = '';

export function buildApiUrl(path: string): string {
  return path.startsWith('/') ? path : '/' + path;
}
