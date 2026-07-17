export type PncpContractHit = {
  title: string;
  description: string;
  orgao: string;
  publishedAt: string;
  url: string;
};

export type PncpSearchResult = {
  query: string;
  total: number;
  hits: PncpContractHit[];
};

const PNCP_SEARCH_URL = 'https://pncp.gov.br/api/search/';

export const pncpSearchUrl = (query: string, pageSize = 5) =>
  `${PNCP_SEARCH_URL}?q=${encodeURIComponent(query)}&tipos_documento=contrato&pagina=1&tam_pagina=${pageSize}&ordenacao=-data`;

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

// The PNCP search payload is loosely specified; parse defensively and keep
// only the fields the treatment layer needs as evidence.
const parseHit = (item: unknown): PncpContractHit | null => {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const title = asString(record.title) || asString(record.description).slice(0, 120);
  if (!title) return null;
  const id = asString(record.id) || asString(record.numero_controle_pncp);
  return {
    title,
    description: asString(record.description).slice(0, 400),
    orgao: asString(record.orgao_nome) || asString(record.orgao),
    publishedAt: asString(record.data_publicacao_pncp) || asString(record.createdAt),
    url: id ? `https://pncp.gov.br/app/contratos?q=${encodeURIComponent(id)}` : 'https://pncp.gov.br/app/contratos',
  };
};

export async function searchPncpContracts(query: string, pageSize = 5): Promise<PncpSearchResult> {
  const response = await fetch(pncpSearchUrl(query, pageSize), { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`PNCP search failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const hits = rawItems.map(parseHit).filter((hit): hit is PncpContractHit => Boolean(hit));

  return {
    query,
    total: Number(payload.total ?? hits.length) || hits.length,
    hits,
  };
}
