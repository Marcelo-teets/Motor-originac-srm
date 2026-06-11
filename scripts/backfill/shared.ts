import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export type CliArgs = Record<string, string | true>;

export type YearMonth = {
  year: number;
  month: number;
};

export type CsvRecord = {
  fields: string[];
  raw: string;
  lineNumber: number;
};

export type ZipTextEntry = {
  fileName: string;
  content: Buffer;
};

type ZipCentralDirectoryEntry = {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

export const parseCliArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf('=');
    if (equalsIndex >= 0) {
      args[withoutPrefix.slice(0, equalsIndex)] = withoutPrefix.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[withoutPrefix] = next;
      index += 1;
      continue;
    }

    args[withoutPrefix] = true;
  }

  return args;
};

export const requireStringArg = (args: CliArgs, name: string) => {
  const value = args[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required argument --${name}`);
  }
  return value.trim();
};

export const getSupabaseConfig = (): SupabaseConfig => {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '') ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url) throw new Error('Missing SUPABASE_URL');
  if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

  return { url, serviceRoleKey };
};

export const parseYearMonth = (value: string): YearMonth => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid month "${value}". Expected YYYY-MM.`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month "${value}". Month must be 01-12.`);

  return { year, month };
};

export const formatYearMonth = (value: YearMonth) => `${value.year}-${String(value.month).padStart(2, '0')}`;

export const toCompetenceDate = (value: YearMonth) => `${formatYearMonth(value)}-01`;

export const compareYearMonth = (left: YearMonth, right: YearMonth) =>
  left.year === right.year ? left.month - right.month : left.year - right.year;

export const addMonths = (value: YearMonth, months: number): YearMonth => {
  const zeroBased = value.year * 12 + value.month - 1 + months;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1,
  };
};

export const eachMonth = (from: YearMonth, to: YearMonth): YearMonth[] => {
  if (compareYearMonth(from, to) > 0) {
    throw new Error(`Invalid range: --from ${formatYearMonth(from)} is after --to ${formatYearMonth(to)}`);
  }

  const months: YearMonth[] = [];
  for (let cursor = from; compareYearMonth(cursor, to) <= 0; cursor = addMonths(cursor, 1)) {
    months.push(cursor);
  }
  return months;
};

export const parseDateInput = (value: string, bound: 'start' | 'end'): Date => {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(value);
  if (monthMatch) {
    const { year, month } = parseYearMonth(value);
    const day = bound === 'start' ? 1 : new Date(Date.UTC(year, month, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1, day));
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!dateMatch) throw new Error(`Invalid date "${value}". Expected YYYY-MM or YYYY-MM-DD.`);

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date "${value}".`);
  }

  return parsed;
};

export const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const formatBcbDate = (date: Date) => {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
};

export const parseBcbDate = (value: string): string => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error(`Invalid BCB date "${value}".`);
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid BCB date "${value}".`);
  }
  return toIsoDate(parsed);
};

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export const addYears = (date: Date, years: number) => {
  const result = new Date(date.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
};

export const splitIntoTenYearWindows = (from: Date, to: Date): Array<{ from: Date; to: Date }> => {
  if (from.getTime() > to.getTime()) {
    throw new Error(`Invalid range: --from ${toIsoDate(from)} is after --to ${toIsoDate(to)}`);
  }

  const windows: Array<{ from: Date; to: Date }> = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    const maxWindowEnd = addDays(addYears(cursor, 10), -1);
    const windowEnd = maxWindowEnd.getTime() < to.getTime() ? maxWindowEnd : to;
    windows.push({ from: cursor, to: windowEnd });
    cursor = addDays(windowEnd, 1);
  }
  return windows;
};

export const fetchBufferWithRetry = async (url: string, attempts = 3): Promise<Buffer> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error = new Error(`GET ${url} failed with ${response.status}`);
        if (!isRetryableStatus(response.status) || attempt === attempts) throw error;
        lastError = error;
      } else {
        return Buffer.from(await response.arrayBuffer());
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }

    await sleep(2 ** (attempt - 1) * 1_000);
  }

  throw lastError instanceof Error ? lastError : new Error(`GET ${url} failed`);
};

export const fetchJsonWithRetry = async <T>(url: string, attempts = 3): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      const bodyText = await response.text();
      if (!response.ok) {
        const error = new Error(`GET ${url} failed with ${response.status}: ${bodyText.slice(0, 300)}`);
        if (!isRetryableStatus(response.status) || attempt === attempts) throw error;
        lastError = error;
      } else {
        return JSON.parse(bodyText) as T;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }

    await sleep(2 ** (attempt - 1) * 1_000);
  }

  throw lastError instanceof Error ? lastError : new Error(`GET ${url} failed`);
};

export const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const normalizeCnpj = (value: unknown): string | null => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 14) return null;
  return digits.slice(0, 14);
};

const decodePostgrestError = async (response: Response) => {
  const text = await response.text();
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
};

export const upsertRows = async <T extends Record<string, unknown>>(
  config: SupabaseConfig,
  table: string,
  rows: T[],
  conflictColumns: string[],
) => {
  if (rows.length === 0) return;

  const url = `${config.url}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictColumns.join(','))}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    throw new Error(`Supabase upsert ${table} failed with ${response.status}: ${await decodePostgrestError(response)}`);
  }
};

export const upsertInBatches = async <T extends Record<string, unknown>>(
  config: SupabaseConfig,
  table: string,
  rows: T[],
  conflictColumns: string[],
  label: string,
  batchSize = 500,
) => {
  const totalBatches = Math.ceil(rows.length / batchSize);
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const batchNumber = Math.floor(offset / batchSize) + 1;
    console.log(`[${label}] upserting batch ${batchNumber}/${totalBatches} (${batch.length} rows)`);
    await upsertRows(config, table, batch, conflictColumns);
  }
};

export const parseDelimited = (content: string, delimiter = ';'): CsvRecord[] => {
  const normalized = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let raw = '';
  let inQuotes = false;
  let lineNumber = 1;
  let recordLineNumber = 1;

  const finishRecord = () => {
    fields.push(field);
    const hasContent = fields.some((value) => value.length > 0);
    if (hasContent) {
      records.push({ fields, raw, lineNumber: recordLineNumber });
    }
    fields = [];
    field = '';
    raw = '';
    recordLineNumber = lineNumber;
  };

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '"') {
      raw += char;
      if (inQuotes && next === '"') {
        field += '"';
        raw += next;
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      fields.push(field);
      field = '';
      raw += char;
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      finishRecord();
      if (char === '\r' && next === '\n') index += 1;
      lineNumber += 1;
      recordLineNumber = lineNumber;
      continue;
    }

    field += char;
    raw += char;
    if (char === '\n') lineNumber += 1;
  }

  if (field.length > 0 || fields.length > 0 || raw.length > 0) {
    finishRecord();
  }

  if (inQuotes) throw new Error('Invalid CSV: unterminated quoted field.');
  return records;
};

export const csvRowToObject = (headers: string[], fields: string[]): JsonObject => {
  const seen = new Map<string, number>();
  return headers.reduce<JsonObject>((row, header, index) => {
    const cleanHeader = header.trim() || `column_${index + 1}`;
    const count = seen.get(cleanHeader) ?? 0;
    seen.set(cleanHeader, count + 1);
    const key = count === 0 ? cleanHeader : `${cleanHeader}_${count + 1}`;
    row[key] = fields[index] ?? '';
    return row;
  }, {});
};

const findEndOfCentralDirectoryOffset = (archive: Buffer) => {
  const signature = 0x06054b50;
  const minOffset = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error('Invalid ZIP archive: end of central directory not found.');
};

const readZipCentralDirectory = (archive: Buffer): ZipCentralDirectoryEntry[] => {
  const centralFileHeaderSignature = 0x02014b50;
  const eocdOffset = findEndOfCentralDirectoryOffset(archive);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16);
  const entries: ZipCentralDirectoryEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== centralFileHeaderSignature) {
      throw new Error(`Invalid ZIP archive: central directory entry ${index + 1} is malformed.`);
    }

    const compressionMethod = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const fileNameLength = archive.readUInt16LE(offset + 28);
    const extraFieldLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const fileNameStart = offset + 46;
    const fileName = archive.subarray(fileNameStart, fileNameStart + fileNameLength).toString('utf8');

    entries.push({ fileName, compressionMethod, compressedSize, localHeaderOffset });
    offset = fileNameStart + fileNameLength + extraFieldLength + commentLength;
  }

  return entries;
};

const readZipEntryContent = (archive: Buffer, entry: ZipCentralDirectoryEntry) => {
  const localFileHeaderSignature = 0x04034b50;
  const offset = entry.localHeaderOffset;
  if (archive.readUInt32LE(offset) !== localFileHeaderSignature) {
    throw new Error(`Invalid ZIP archive: local header not found for ${entry.fileName}.`);
  }

  const fileNameLength = archive.readUInt16LE(offset + 26);
  const extraFieldLength = archive.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;
  const compressed = archive.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return Buffer.from(compressed);
  if (entry.compressionMethod === 8) return inflateRawSync(compressed);

  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.fileName}.`);
};

export const extractZipCsvEntries = async (archive: Buffer): Promise<ZipTextEntry[]> =>
  readZipCentralDirectory(archive)
    .filter((entry) => !entry.fileName.endsWith('/') && entry.fileName.toLowerCase().endsWith('.csv'))
    .map((entry) => ({ fileName: entry.fileName, content: readZipEntryContent(archive, entry) }));
