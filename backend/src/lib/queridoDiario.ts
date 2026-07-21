export type GazetteHit = {
  date: string;
  territoryName: string;
  excerpts: string[];
  url: string;
};

export type GazetteSearchResult = {
  query: string;
  total: number;
  hits: GazetteHit[];
};

const QUERIDO_DIARIO_API = 'https://queridodiario.ok.org.br/api/gazettes';

export const queridoDiarioSearchUrl = (query: string, size = 3) =>
  `${QUERIDO_DIARIO_API}?querystring=${encodeURIComponent(`"${query}"`)}&size=${size}&sort_by=descending_date`;

export async function searchQueridoDiario(query: string, size = 3): Promise<GazetteSearchResult> {
  const response = await fetch(queridoDiarioSearchUrl(query, size), { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Querido Diário search failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    total_gazettes?: number;
    gazettes?: Array<{
      date?: string;
      territory_name?: string;
      excerpts?: string[];
      url?: string;
      txt_url?: string;
    }>;
  };

  const hits = (payload.gazettes ?? [])
    .map((gazette) => ({
      date: gazette.date ?? '',
      territoryName: gazette.territory_name ?? '',
      excerpts: (gazette.excerpts ?? []).slice(0, 2).map((excerpt) => excerpt.replace(/\s+/g, ' ').trim().slice(0, 300)),
      url: gazette.url ?? gazette.txt_url ?? 'https://queridodiario.ok.org.br',
    }))
    .filter((hit) => hit.date || hit.excerpts.length);

  return {
    query,
    total: Number(payload.total_gazettes ?? hits.length) || hits.length,
    hits,
  };
}
