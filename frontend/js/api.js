const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : 'http://localhost:8000';

export async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`API error for ${path}: ${response.status}`);
  }
  return response.json();
}

export async function apiPost(path, body = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`API error for ${path}: ${response.status}`);
  }
  return response.json();
}
