export type BcbSgsSeriesConfig = {
  code: number;
  name: string;
  unit: string;
};

export type BcbSgsObservation = {
  date: string;
  value: number;
};

export type BcbSgsSeriesResult = BcbSgsSeriesConfig & {
  observations: BcbSgsObservation[];
  latest: BcbSgsObservation | null;
};

// Núcleo de indexadores macro/crédito (migration 022: "Selic, IPCA, FX and
// credit indexers"). Sobreponível por fonte via metadata.series no catálogo.
export const DEFAULT_MACRO_SERIES: BcbSgsSeriesConfig[] = [
  { code: 432, name: 'Selic meta', unit: '% a.a.' },
  { code: 12, name: 'CDI diário', unit: '% a.d.' },
  { code: 433, name: 'IPCA mensal', unit: '% a.m.' },
  { code: 189, name: 'IGP-M mensal', unit: '% a.m.' },
  { code: 1, name: 'Dólar comercial (venda)', unit: 'BRL' },
];

const SGS_BASE_URL = 'https://api.bcb.gov.br/dados/serie';

export const bcbSgsSeriesUrl = (seriesCode: number, lastN: number) =>
  `${SGS_BASE_URL}/bcdata.sgs.${seriesCode}/dados/ultimos/${lastN}?formato=json`;

const parseBrNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export async function fetchBcbSgsSeries(series: BcbSgsSeriesConfig, lastN = 3): Promise<BcbSgsSeriesResult> {
  const response = await fetch(bcbSgsSeriesUrl(series.code, lastN), { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`BCB SGS series ${series.code} request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as Array<{ data?: string; valor?: string }>;
  if (!Array.isArray(payload)) {
    throw new Error(`BCB SGS series ${series.code} returned an invalid payload`);
  }

  const observations = payload
    .map((row) => {
      const value = parseBrNumber(row.valor);
      if (!row.data || value === null) return null;
      return { date: row.data, value } satisfies BcbSgsObservation;
    })
    .filter((row): row is BcbSgsObservation => Boolean(row));

  return {
    ...series,
    observations,
    latest: observations.at(-1) ?? null,
  };
}

export const parseSeriesMetadata = (value: unknown): BcbSgsSeriesConfig[] => {
  if (!Array.isArray(value)) return DEFAULT_MACRO_SERIES;
  const parsed = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const code = Number(record.code);
      if (!Number.isFinite(code) || code <= 0) return null;
      return {
        code,
        name: typeof record.name === 'string' && record.name ? record.name : `Série SGS ${code}`,
        unit: typeof record.unit === 'string' ? record.unit : '',
      } satisfies BcbSgsSeriesConfig;
    })
    .filter((entry): entry is BcbSgsSeriesConfig => Boolean(entry));
  return parsed.length ? parsed : DEFAULT_MACRO_SERIES;
};
