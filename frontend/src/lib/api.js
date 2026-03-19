const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.detail || 'Falha na comunicação com a API')
  }
  return response.json()
}

export const api = {
  health: () => request('/health'),
  listSources: () => request('/sources'),
  listCompanies: () => request('/companies'),
  createCompany: (payload) => request('/companies', { method: 'POST', body: JSON.stringify(payload) }),
  listSignals: (companyId) => request(companyId ? `/signals?company_id=${companyId}` : '/signals'),
  createSignal: (payload) => request('/signals', { method: 'POST', body: JSON.stringify(payload) }),
  getScore: (companyId) => request(`/companies/${companyId}/score`),
  getScoreHistory: (companyId) => request(`/companies/${companyId}/score/history`),
  getThesis: (companyId) => request(`/companies/${companyId}/thesis`),
  getMarketMap: () => request('/market-map'),
}
