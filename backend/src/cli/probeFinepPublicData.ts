import { basename } from 'node:path';
import { extractZipArchiveEntry, listZipArchiveEntries } from '../lib/zipArchive.js';

const PAGE_CANDIDATES = [
  'https://www.finep.gov.br/transparencia-finep/paineis-e-downloads/central-de-downloads',
  'https://legacy.finep.gov.br/transparencia-finep/paineis-e-downloads/central-de-downloads',
  'https://www.finep.gov.br/home?start=1168',
] as const;
const USER_AGENT = 'OriginationIntelligencePlatform/1.0 (+https://github.com/Marcelo-teets/Motor-originac-srm)';
const MAX_WORKBOOK_BYTES = 128 * 1024 * 1024;

type FinepResourceKind = 'operations' | 'disbursements';
type FinepResource = { kind: FinepResourceKind; name: string; url: string; pageUrl: string };

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const decodeEntities = (value: string) => value
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
const stripHtml = (value: string) => clean(decodeEntities(value.replace(/<[^>]+>/g, ' ')));
const normalizeText = (value: string) => stripHtml(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

async function fetchBuffer(url: string, timeoutMs: number) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { accept: '*/*', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_WORKBOOK_BYTES) throw new Error(`Resource exceeds ${MAX_WORKBOOK_BYTES} bytes: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_WORKBOOK_BYTES) throw new Error(`Downloaded resource exceeds ${MAX_WORKBOOK_BYTES} bytes: ${url}`);
  return { buffer, response };
}

function decodePage(buffer: Buffer, contentType: string | null) {
  const charset = contentType?.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  const encodings = [charset, 'utf-8', 'windows-1252', 'latin1'].filter(Boolean) as string[];
  for (const encoding of [...new Set(encodings)]) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
      if (/<html|<table|operac/i.test(text)) return text;
    } catch {
      // Try the next declared/common Finep encoding.
    }
  }
  return buffer.toString('latin1');
}

function anchorsFromHtml(fragment: string, baseUrl: string) {
  return [...fragment.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].flatMap((match) => {
    try {
      return [{ url: new URL(decodeEntities(match[1]!), baseUrl).toString(), text: stripHtml(match[2] ?? '') }];
    } catch {
      return [];
    }
  });
}

function selectResource(rows: string[], pageUrl: string, kind: FinepResourceKind): FinepResource | null {
  const candidates: Array<{ url: string; text: string; context: string }> = [];
  for (const row of rows) {
    const context = normalizeText(row);
    const rowKind = /desembols/.test(context) ? 'disbursements' : /operac.*contratad/.test(context) ? 'operations' : null;
    if (rowKind !== kind) continue;
    for (const anchor of anchorsFromHtml(row, pageUrl)) candidates.push({ ...anchor, context });
  }

  const ranked = candidates
    .filter((candidate) => /xlsx|excel|\.xls(?:x)?(?:\?|$)/i.test(`${candidate.text} ${candidate.url}`))
    .sort((left, right) => {
      const score = (candidate: typeof left) => Number(/\.xlsx(?:\?|$)/i.test(candidate.url)) * 4
        + Number(/xlsx/i.test(candidate.text)) * 3
        + Number(/download|arquivo|planilha/i.test(candidate.url))
        - Number(/ods/i.test(`${candidate.text} ${candidate.url}`)) * 5;
      return score(right) - score(left);
    });
  const selected = ranked[0];
  if (!selected) return null;
  return {
    kind,
    name: kind === 'operations' ? 'Finep operações contratadas' : 'Finep desembolsos das operações contratadas',
    url: selected.url,
    pageUrl,
  };
}

async function discoverFinepResources(): Promise<FinepResource[]> {
  const errors: string[] = [];
  for (const pageUrl of PAGE_CANDIDATES) {
    try {
      const { buffer, response } = await fetchBuffer(pageUrl, 25_000);
      const html = decodePage(buffer, response.headers.get('content-type'));
      const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [html];
      const resources = [
        selectResource(rows, pageUrl, 'operations'),
        selectResource(rows, pageUrl, 'disbursements'),
      ].filter((value): value is FinepResource => Boolean(value));
      if (resources.length === 2) return resources;
      errors.push(`${pageUrl}: discovered ${resources.length}/2 XLSX resources`);
    } catch (error) {
      errors.push(`${pageUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Finep XLSX discovery failed. ${errors.join(' | ')}`);
}

function xmlText(value: string) {
  return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
}

function sharedStringsFromWorkbook(entries: Map<string, Buffer>) {
  const xml = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) =>
    clean([...match[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((item) => xmlText(item[1] ?? '')).join('')),
  );
}

function workbookSheets(entries: Map<string, Buffer>) {
  const workbook = entries.get('xl/workbook.xml')?.toString('utf8');
  const relationships = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8');
  if (!workbook || !relationships) throw new Error('XLSX workbook metadata is incomplete.');
  const rels = new Map([...relationships.matchAll(/<Relationship\b[^>]*Id=["']([^"']+)["'][^>]*Target=["']([^"']+)["'][^>]*\/?>(?:<\/Relationship>)?/gi)]
    .map((match) => [match[1]!, match[2]!]));
  return [...workbook.matchAll(/<sheet\b[^>]*name=["']([^"']+)["'][^>]*(?:r:id|id)=["']([^"']+)["'][^>]*\/?>(?:<\/sheet>)?/gi)].flatMap((match) => {
    const target = rels.get(match[2]!);
    if (!target) return [];
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    return [{ name: xmlText(match[1]!), path: path.replace(/\/\.\//g, '/') }];
  });
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? '';
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellValue(cell: string, sharedStrings: string[]) {
  const type = cell.match(/\bt=["']([^"']+)["']/i)?.[1] ?? '';
  if (type === 'inlineStr') {
    return clean([...cell.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => xmlText(match[1] ?? '')).join(''));
  }
  const raw = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? '';
  if (type === 's') return sharedStrings[Number(raw)] ?? '';
  if (type === 'b') return raw === '1' ? 'true' : 'false';
  return clean(xmlText(raw));
}

function inspectSheet(xml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  for (const match of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const values: string[] = [];
    for (const cellMatch of match[1]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const ref = cellMatch[1]!.match(/\br=["']([^"']+)["']/i)?.[1] ?? '';
      const index = Math.max(0, columnIndex(ref));
      values[index] = cellValue(`<c ${cellMatch[1]}>${cellMatch[2]}</c>`, sharedStrings);
    }
    if (values.some((value) => clean(value))) rows.push(values.map((value) => clean(value ?? '')));
    if (rows.length >= 30) break;
  }
  const scored = rows.map((row, index) => ({ index, row, nonEmpty: row.filter(Boolean).length }));
  const header = scored.sort((left, right) => right.nonEmpty - left.nonEmpty || left.index - right.index)[0];
  return {
    sampledRows: rows.length,
    headerRow: header ? header.index + 1 : null,
    headers: header?.row.filter(Boolean) ?? [],
  };
}

function inspectWorkbook(buffer: Buffer) {
  const listed = listZipArchiveEntries(buffer, {
    maxEntries: 5_000,
    maxEntryBytes: 96 * 1024 * 1024,
    maxTotalUncompressedBytes: 512 * 1024 * 1024,
  });
  const wanted = listed.filter((entry) => entry.name === 'xl/workbook.xml'
    || entry.name === 'xl/_rels/workbook.xml.rels'
    || entry.name === 'xl/sharedStrings.xml'
    || /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name));
  const entries = new Map(wanted.map((entry) => [entry.name, extractZipArchiveEntry(buffer, entry)]));
  const sharedStrings = sharedStringsFromWorkbook(entries);
  return workbookSheets(entries).map((sheet) => {
    const xml = entries.get(sheet.path)?.toString('utf8');
    return {
      name: sheet.name,
      path: sheet.path,
      ...(xml ? inspectSheet(xml, sharedStrings) : { sampledRows: 0, headerRow: null, headers: [] }),
    };
  });
}

const startedAt = new Date().toISOString();
const resources = await discoverFinepResources();
const workbooks = [];
for (const resource of resources) {
  const { buffer, response } = await fetchBuffer(resource.url, 90_000);
  if (buffer.readUInt32LE(0) !== 0x04034b50) throw new Error(`Finep resource is not an XLSX/ZIP archive: ${resource.url}`);
  workbooks.push({
    ...resource,
    finalUrl: response.url,
    bytes: buffer.length,
    contentType: response.headers.get('content-type'),
    lastModified: response.headers.get('last-modified'),
    etag: response.headers.get('etag'),
    fileName: basename(new URL(response.url).pathname) || basename(new URL(resource.url).pathname),
    sheets: inspectWorkbook(buffer),
  });
}

const result = {
  status: 'real',
  source: 'Finep Central de Downloads',
  startedAt,
  finishedAt: new Date().toISOString(),
  resourcesDiscovered: resources.length,
  workbooks,
};
console.log(JSON.stringify(result, null, 2));
if (resources.length !== 2 || workbooks.some((workbook) => !workbook.sheets.length)) process.exitCode = 1;
