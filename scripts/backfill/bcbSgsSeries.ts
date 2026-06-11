import {
  fetchJsonWithRetry,
  formatBcbDate,
  getSupabaseConfig,
  parseBcbDate,
  parseCliArgs,
  parseDateInput,
  requireStringArg,
  splitIntoTenYearWindows,
  toIsoDate,
  upsertInBatches,
} from './shared.js';

const BCB_BASE_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';
const BATCH_SIZE = 500;

const DEFAULT_SERIES = ['20714', '21082', '21112', '25434'];

const SERIES_CATALOG: Record<string, { name: string; unit: string }> = {
  '20714': { name: 'Saldo credito PJ', unit: 'R$ milhoes' },
  '21082': { name: 'Inadimplencia PJ', unit: '%' },
  '21112': { name: 'Spread ICC', unit: 'p.p.' },
  '25434': { name: 'Concessoes PJ', unit: 'R$ milhoes' },
};

type BcbObservation = {
  data: string;
  valor: string;
};

type MacroSeriesObservation = {
  series_code: string;
  series_name: string;
  ref_date: string;
  value: number;
  unit: string;
  source: string;
};

const parseSeriesArg = (value: string | true | undefined) => {
  if (value === undefined || value === true || value.trim() === '') return DEFAULT_SERIES;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
};

const buildUrl = (seriesCode: string, from: Date, to: Date) => {
  const params = new URLSearchParams({
    formato: 'json',
    dataInicial: formatBcbDate(from),
    dataFinal: formatBcbDate(to),
  });
  return `${BCB_BASE_URL}.${seriesCode}/dados?${params.toString()}`;
};

const parseBcbNumber = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid BCB numeric value "${value}"`);
  }
  return parsed;
};

const toRows = (seriesCode: string, source: string, observations: BcbObservation[]): MacroSeriesObservation[] => {
  const metadata = SERIES_CATALOG[seriesCode] ?? { name: `SGS ${seriesCode}`, unit: 'valor SGS' };
  return observations.map((observation) => ({
    series_code: seriesCode,
    series_name: metadata.name,
    ref_date: parseBcbDate(observation.data),
    value: parseBcbNumber(observation.valor),
    unit: metadata.unit,
    source,
  }));
};

const run = async () => {
  const args = parseCliArgs(process.argv.slice(2));
  const from = parseDateInput(requireStringArg(args, 'from'), 'start');
  const to = parseDateInput(requireStringArg(args, 'to'), 'end');
  const series = parseSeriesArg(args.series);
  const windows = splitIntoTenYearWindows(from, to);
  const supabase = getSupabaseConfig();

  console.log(`[bcb-sgs] processing ${series.length} series across ${windows.length} window(s): ${toIsoDate(from)}..${toIsoDate(to)}`);

  for (const seriesCode of series) {
    const rows: MacroSeriesObservation[] = [];
    for (const window of windows) {
      const url = buildUrl(seriesCode, window.from, window.to);
      console.log(`[bcb-sgs:${seriesCode}] downloading ${toIsoDate(window.from)}..${toIsoDate(window.to)}`);
      const observations = await fetchJsonWithRetry<BcbObservation[]>(url);
      rows.push(...toRows(seriesCode, url, observations));
      console.log(`[bcb-sgs:${seriesCode}] parsed ${observations.length} observation(s) from window`);
    }

    await upsertInBatches(
      supabase,
      'macro_series_observations',
      rows,
      ['series_code', 'ref_date'],
      `bcb-sgs:${seriesCode}`,
      BATCH_SIZE,
    );
  }

  console.log('[bcb-sgs] done');
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
