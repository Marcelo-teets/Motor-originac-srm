export async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function toDisplayLabel(value) {
  return String(value)
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatPrimitive(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'number') {
    return new Intl.NumberFormat('pt-BR').format(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (typeof value === 'string') {
    const asDate = Date.parse(value);

    if (!Number.isNaN(asDate) && /\d{4}-\d{2}-\d{2}|T/.test(value)) {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'medium',
        timeStyle: value.includes('T') ? 'short' : undefined,
      }).format(asDate);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(formatPrimitive).join(', ');
  }

  return JSON.stringify(value);
}

export async function loadCompanyResources(companyId) {
  const resources = {
    scoreHistory: `/api/v1/score-history/companies/${companyId}`,
    thesis: `/api/v1/companies/${companyId}/thesis`,
    marketMap: `/api/v1/companies/${companyId}/market-map`,
    monitoring: `/api/v1/companies/${companyId}/monitoring-output`,
  };

  const entries = await Promise.all(
    Object.entries(resources).map(async ([key, url]) => {
      try {
        const data = await fetchJson(url);
        return [key, { data, error: null }];
      } catch (error) {
        return [key, { data: null, error: error instanceof Error ? error.message : 'Unknown error' }];
      }
    }),
  );

  return Object.fromEntries(entries);
}
