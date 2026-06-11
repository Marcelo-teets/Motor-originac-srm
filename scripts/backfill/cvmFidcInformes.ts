import path from 'node:path';
import {
  csvRowToObject,
  eachMonth,
  extractZipCsvEntries,
  fetchBufferWithRetry,
  formatYearMonth,
  getSupabaseConfig,
  normalizeCnpj,
  parseCliArgs,
  parseDelimited,
  parseYearMonth,
  requireStringArg,
  sha256Hex,
  toCompetenceDate,
  upsertInBatches,
  type JsonObject,
} from './shared.js';

const DATASET_CODE = 'cvm_fidc_inf_mensal';
const CVM_BASE_URL = 'https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS';
const BATCH_SIZE = 500;

const CNPJ_FIELDS = [
  'CNPJ_FUNDO',
  'CNPJ_FUNDO_CLASSE',
  'CNPJ_FIDC',
  'CNPJ_FUNDO_COTA',
  'CNPJ',
  'cnpj_fundo',
  'cnpj',
];

type BronzeHistoricalRecord = {
  dataset_code: typeof DATASET_CODE;
  record_key: string;
  ref_date: string;
  entity_cnpj: string | null;
  payload: JsonObject;
  source_url: string;
  content_hash: string;
};

const buildZipUrl = (competence: string) =>
  `${CVM_BASE_URL}/inf_mensal_fidc_${competence.replace('-', '')}.zip`;

const findCnpj = (row: JsonObject) => {
  for (const field of CNPJ_FIELDS) {
    const normalized = normalizeCnpj(row[field]);
    if (normalized) return normalized;
  }

  for (const [key, value] of Object.entries(row)) {
    if (key.toLowerCase().includes('cnpj')) {
      const normalized = normalizeCnpj(value);
      if (normalized) return normalized;
    }
  }

  return null;
};

const parseCsvRows = (
  content: Buffer,
  sourceUrl: string,
  csvFileName: string,
  competence: string,
): BronzeHistoricalRecord[] => {
  const decoded = new TextDecoder('latin1').decode(content);
  const records = parseDelimited(decoded, ';');
  const [headerRecord, ...dataRecords] = records;
  if (!headerRecord) return [];

  const headers = headerRecord.fields.map((header) => header.trim());
  const refDate = `${competence}-01`;
  let skippedWithoutCnpj = 0;

  const rows = dataRecords.flatMap((record): BronzeHistoricalRecord[] => {
    const payload = csvRowToObject(headers, record.fields);
    const cnpj = findCnpj(payload);
    if (!cnpj) {
      skippedWithoutCnpj += 1;
      return [];
    }

    return [{
      dataset_code: DATASET_CODE,
      record_key: `${cnpj}:${competence}:${csvFileName}`,
      ref_date: refDate,
      entity_cnpj: cnpj,
      payload,
      source_url: sourceUrl,
      content_hash: sha256Hex(record.raw),
    }];
  });

  if (skippedWithoutCnpj > 0) {
    console.warn(`[cvm-fidc:${competence}:${csvFileName}] skipped ${skippedWithoutCnpj} row(s) without CNPJ`);
  }

  return rows;
};

const run = async () => {
  const args = parseCliArgs(process.argv.slice(2));
  const from = parseYearMonth(requireStringArg(args, 'from'));
  const to = parseYearMonth(requireStringArg(args, 'to'));
  const supabase = getSupabaseConfig();
  const months = eachMonth(from, to);

  console.log(`[cvm-fidc] processing ${months.length} competence month(s)`);

  for (const month of months) {
    const competence = formatYearMonth(month);
    const refDate = toCompetenceDate(month);
    const zipUrl = buildZipUrl(competence);
    console.log(`[cvm-fidc:${competence}] downloading ${zipUrl}`);

    const archive = await fetchBufferWithRetry(zipUrl);
    const csvEntries = await extractZipCsvEntries(archive);
    console.log(`[cvm-fidc:${competence}] extracted ${csvEntries.length} csv file(s)`);

    for (const entry of csvEntries) {
      const csvFileName = path.posix.basename(entry.fileName);
      const rows = parseCsvRows(entry.content, zipUrl, csvFileName, competence);
      console.log(`[cvm-fidc:${competence}:${csvFileName}] parsed ${rows.length} row(s) for ref_date ${refDate}`);
      await upsertInBatches(
        supabase,
        'bronze_historical_records',
        rows,
        ['dataset_code', 'record_key'],
        `cvm-fidc:${competence}:${csvFileName}`,
        BATCH_SIZE,
      );
    }
  }

  console.log('[cvm-fidc] done');
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
