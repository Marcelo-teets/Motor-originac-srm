import { createHash } from 'node:crypto';
import { extractZipArchiveEntry, listZipArchiveEntries, type ZipArchiveEntry } from '../../lib/zipArchive.js';

export const FINEP_DATASET_CODE = 'finep_financing_operations' as const;
export const FINEP_SOURCE_CODE = 'src_finep_financing_operations' as const;

export type FinepResourceKind = 'operations' | 'disbursements';
export type FinepFundingNature = 'reimbursable_credit' | 'non_reimbursable_grant' | 'equity_investment';
export type FinepSheetCategory =
  | 'credit_direct'
  | 'credit_decentralized'
  | 'credit_terms'
  | 'grant_direct'
  | 'grant_decentralized'
  | 'non_reimbursable_ict'
  | 'direct_investment'
  | 'ancine';

export type FinepPublicResource = {
  kind: FinepResourceKind;
  key: string;
  name: string;
  url: string;
  pageUrl: string;
  referenceDate: string | null;
  modifiedAt: string | null;
  etag: string | null;
  format: 'xlsx';
};

export type FinepPublicRecord = {
  datasetCode: typeof FINEP_DATASET_CODE;
  sourceCode: typeof FINEP_SOURCE_CODE;
  recordKey: string;
  entityCnpj: string;
  entityName: string | null;
  recordType: 'finep_credit_operation' | 'finep_credit_terms' | 'finep_grant_operation' | 'finep_direct_investment' | 'finep_disbursement';
  referenceDate: string | null;
  amount: number | null;
  status: string | null;
  sourceUrl: string;
  resourceKey: string;
  contentHash: string;
  rawPayload: Record<string, string>;
  normalizedPayload: Record<string, unknown>;
};

export type FinepStreamStats = {
  rowsScanned: number;
  recordsMatched: number;
  sheetsScanned: number;
  workbookEntries: number;
};

const PAGE_CANDIDATES = [
  'https://www.finep.gov.br/transparencia-finep/paineis-e-downloads/central-de-downloads',
  'https://legacy.finep.gov.br/transparencia-finep/paineis-e-downloads/central-de-downloads',
  'https://www.finep.gov.br/home?start=1168',
] as const;
const DIRECT_RESOURCES: Record<FinepResourceKind, string> = {
  operations: 'https://download.finep.gov.br/Contratacao.xlsx',
  disbursements: 'https://download.finep.gov.br/Liberacao.xlsx',
};
const USER_AGENT = 'OriginationIntelligencePlatform/1.0 (+https://github.com/Marcelo-teets/Motor-originac-srm)';
const MAX_WORKBOOK_BYTES = 128 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
export const normalizeFinepHeader = (value: string) => clean(value)
  .replace(/^\uFEFF/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

const parseNumber = (value: unknown) => {
  const text = clean(value);
  if (!text) return null;
  if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) {
    const direct = Number(text);
    return Number.isFinite(direct) ? direct : null;
  }
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
    : text.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseFinepDate = (value: unknown) => {
  const text = clean(value);
  if (!text) return null;
  const numeric = Number(text);
  if (/^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(numeric) && numeric >= 20_000 && numeric <= 80_000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.trunc(numeric) * 86_400_000).toISOString().slice(0, 10);
  }
  const br = text.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
};

const normalizeCnpj = (value: unknown) => {
  const text = clean(value);
  if (!text) return '';
  let normalized = digits(text);
  if (/e[+-]?\d+/i.test(text)) {
    const numeric = Number(text);
    if (Number.isFinite(numeric)) normalized = Math.trunc(numeric).toFixed(0);
  }
  return normalized.length > 0 && normalized.length <= 14 ? normalized.padStart(14, '0') : normalized;
};
const targetMatch = (cnpj: string, targets: Set<string>, roots: Set<string>) => cnpj.length === 14
  && (targets.has(cnpj) || roots.has(cnpj.slice(0, 8)));
const pick = (row: Record<string, string>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = row[normalizeFinepHeader(alias)];
    if (clean(value)) return clean(value);
  }
  return '';
};

const safeRawPayload = (row: Record<string, string>) => Object.fromEntries(
  Object.entries(row)
    .filter(([key]) => !/(coordenador|cpf|telefone|email|contato|responsavel)/i.test(key))
    .slice(0, 80)
    .map(([key, value]) => [key, clean(value).slice(0, 4_000)]),
);

function fundingNatureFor(category: FinepSheetCategory): FinepFundingNature {
  if (category === 'credit_direct' || category === 'credit_decentralized' || category === 'credit_terms') return 'reimbursable_credit';
  if (category === 'direct_investment') return 'equity_investment';
  return 'non_reimbursable_grant';
}

export function classifyFinepSheet(name: string): FinepSheetCategory | null {
  const normalized = normalizeFinepHeader(name);
  if (/guia|legenda/.test(normalized)) return null;
  if (/condicoes.*fin|condicoes_finc/.test(normalized)) return 'credit_terms';
  if (/investimento_direto.*startup/.test(normalized)) return 'direct_investment';
  if (/cred.*descentralizado|credito_descentralizado/.test(normalized)) return 'credit_decentralized';
  if (/credito_direto/.test(normalized)) return 'credit_direct';
  if (/subv.*descentralizada/.test(normalized)) return 'grant_decentralized';
  if (/subv|subvencao/.test(normalized)) return 'grant_direct';
  if (/nao_reembolsavel.*ict/.test(normalized)) return 'non_reimbursable_ict';
  if (/ancine/.test(normalized)) return 'ancine';
  return null;
}

const recordTypeFor = (resourceKind: FinepResourceKind, category: FinepSheetCategory): FinepPublicRecord['recordType'] => {
  if (resourceKind === 'disbursements') return 'finep_disbursement';
  if (category === 'credit_terms') return 'finep_credit_terms';
  if (category === 'direct_investment') return 'finep_direct_investment';
  if (fundingNatureFor(category) === 'reimbursable_credit') return 'finep_credit_operation';
  return 'finep_grant_operation';
};

function matchedEntity(row: Record<string, string>, targets: Set<string>, roots: Set<string>) {
  const candidates = [
    { role: 'beneficiary', cnpj: pick(row, ['CNPJ Beneficiário', 'CNPJ Beneficiario']), name: pick(row, ['Razão Social', 'Beneficiario']) },
    { role: 'proponent', cnpj: pick(row, ['CNPJ Proponente']), name: pick(row, ['Proponente']) },
    { role: 'company', cnpj: pick(row, ['CNPJ']), name: pick(row, ['Razão Social']) },
    { role: 'executor', cnpj: pick(row, ['CNPJ Executor']), name: pick(row, ['Executor']) },
  ];
  for (const candidate of candidates) {
    const cnpj = normalizeCnpj(candidate.cnpj);
    if (targetMatch(cnpj, targets, roots)) return { ...candidate, cnpj };
  }
  return null;
}

export function normalizeFinepPublicRow(input: {
  resource: FinepPublicResource;
  sheetName: string;
  category: FinepSheetCategory;
  row: Record<string, string>;
  targetCnpjs: Set<string>;
  targetRoots: Set<string>;
}): FinepPublicRecord | null {
  const entity = matchedEntity(input.row, input.targetCnpjs, input.targetRoots);
  if (!entity) return null;

  const fundingNature = fundingNatureFor(input.category);
  const recordType = recordTypeFor(input.resource.kind, input.category);
  const contractNumber = pick(input.row, ['Contrato', 'Número do Contrato', 'Contrato Finep Agente']);
  const projectReference = pick(input.row, ['Ref', 'Refe', 'Referência Projeto', 'Referencia Finep Original']);
  const demand = pick(input.row, ['Demanda', 'Demanda Original Finep']);
  const signedAt = parseFinepDate(pick(input.row, ['Data Assinatura', 'Data assinatura', 'Data da Contratação', 'Data Contratação']));
  const releasedAt = parseFinepDate(pick(input.row, ['Data Liberação', 'Data da Liberacao']));
  const referenceDate = releasedAt ?? signedAt ?? input.resource.referenceDate;
  const amountContracted = parseNumber(pick(input.row, [
    'Valor Finep', 'Valor Financiado', 'Participação Finep', 'Valor Total Contratado', 'Valor do Subcredito', 'Valor total',
  ]));
  const amountDisbursed = parseNumber(pick(input.row, [
    'Valor Liberado - Finep', 'Valor Liberado', 'Valor Total Liberado', 'Valor Pago', 'Total Liberado - Finep', 'Total Liberado',
  ]));
  const amount = input.resource.kind === 'disbursements' ? amountDisbursed : amountContracted;
  const status = pick(input.row, ['Status', 'Situação']);
  const projectTitle = pick(input.row, ['Título', 'Titulo do projeto', 'Titulo Projeto Finep']);
  const releaseNumber = pick(input.row, ['Nº Liberação', 'Numero da Liberação', 'Numero da Liberacao']);
  const installmentNumber = pick(input.row, ['Nº Parcela', 'Numero da Parcela']);
  const subcreditLine = pick(input.row, ['Linha do Subcredito']);
  const financialAgent = pick(input.row, ['Agente', 'FAP']);
  const rawPayload = safeRawPayload(input.row);
  const normalizedPayload = {
    summary: `Finep · ${fundingNature.replaceAll('_', ' ')} · ${entity.name || entity.cnpj}${amount !== null ? ` · R$ ${amount.toFixed(2)}` : ''}`,
    sourceProvider: 'Finep',
    sourceAuthority: 'official_primary',
    sourceConfidence: 0.96,
    sourceWorkbook: input.resource.kind,
    sourceSheet: input.sheetName,
    fundingNature,
    entityRole: entity.role,
    contractNumber: contractNumber || null,
    projectReference: projectReference || null,
    demand: demand || null,
    projectTitle: projectTitle || null,
    signedAt,
    releasedAt,
    amountContracted,
    amountDisbursed,
    releaseNumber: releaseNumber || null,
    installmentNumber: installmentNumber || null,
    subcreditLine: subcreditLine || null,
    financialAgent: financialAgent || null,
    instrument: pick(input.row, ['Instrumento', 'Programa']) || null,
    status: status || null,
    projectState: pick(input.row, ['UF Projeto', 'UF Empresa', 'UF Beneficiário', 'UF Proponente']) || null,
    companySize: pick(input.row, ['Porte Empresa']) || null,
    thematicArea: pick(input.row, ['Área temática']) || null,
    currency: pick(input.row, ['Moeda Contratual']) || null,
    gracePeriod: parseNumber(pick(input.row, ['Carencia'])),
    totalTerm: parseNumber(pick(input.row, ['Prazo Total', 'Prazo Execução', 'Prazo Utilização'])),
    indexer: pick(input.row, ['Indexador']) || null,
    baseSpread: parseNumber(pick(input.row, ['Spread Básico Percentual'])),
    riskSpread: parseNumber(pick(input.row, ['Spread de Risco Percentual'])),
    interestRate: parseNumber(pick(input.row, ['Taxa de Juros'])),
    finalCustomerRate: parseNumber(pick(input.row, ['Taxa final ao cliente'])),
    counterpartAmount: parseNumber(pick(input.row, ['Contrapartida Financeira', 'Contrapartida', 'Contrapartida da empresa'])),
    directInvestmentShare: parseNumber(pick(input.row, ['Participação da Finep (%)'])),
    valuation: parseNumber(pick(input.row, ['Valuation aplicado Opção (R$)'])),
  };
  const identity = {
    datasetCode: FINEP_DATASET_CODE,
    recordType,
    entityCnpj: entity.cnpj,
    sourceSheet: input.sheetName,
    contractNumber,
    projectReference,
    demand,
    releaseNumber,
    installmentNumber,
    releasedAt,
    signedAt,
    subcreditLine,
    fundingNature,
  };

  return {
    datasetCode: FINEP_DATASET_CODE,
    sourceCode: FINEP_SOURCE_CODE,
    recordKey: hash(identity),
    entityCnpj: entity.cnpj,
    entityName: entity.name || null,
    recordType,
    referenceDate,
    amount,
    status: status || null,
    sourceUrl: input.resource.url,
    resourceKey: input.resource.key,
    contentHash: hash({ rawPayload, normalizedPayload }),
    rawPayload,
    normalizedPayload,
  };
}

async function fetchBuffer(url: string, timeoutMs = 90_000) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { accept: '*/*', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Finep request failed: ${response.status} ${url}`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_WORKBOOK_BYTES) throw new Error(`Finep workbook exceeds ${MAX_WORKBOOK_BYTES} bytes: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_WORKBOOK_BYTES) throw new Error(`Finep workbook download exceeds ${MAX_WORKBOOK_BYTES} bytes: ${url}`);
  return { buffer, response };
}

function decodePage(buffer: Buffer, contentType: string | null) {
  const charset = contentType?.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();
  for (const encoding of [...new Set([charset, 'utf-8', 'windows-1252', 'latin1'].filter(Boolean) as string[])]) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
      if (/<html|<table|operac/i.test(text)) return text;
    } catch {
      // Try the next declared/common encoding.
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

function resourceUrlFromPage(html: string, pageUrl: string, kind: FinepResourceKind) {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [html];
  const candidates: Array<{ url: string; text: string }> = [];
  for (const row of rows) {
    const context = normalizeFinepHeader(stripHtml(row));
    const rowKind = context.includes('desembols') ? 'disbursements' : /operac.*contratad/.test(context) ? 'operations' : null;
    if (rowKind !== kind) continue;
    candidates.push(...anchorsFromHtml(row, pageUrl));
  }
  return candidates
    .filter((candidate) => /\.xlsx(?:\?|$)|xlsx|excel/i.test(`${candidate.url} ${candidate.text}`))
    .sort((left, right) => Number(/\.xlsx(?:\?|$)/i.test(right.url)) - Number(/\.xlsx(?:\?|$)/i.test(left.url)))[0]?.url ?? null;
}

async function probeResource(url: string) {
  const { buffer, response } = await fetchBuffer(url, 90_000);
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error(`Finep resource is not an XLSX archive: ${url}`);
  return {
    modifiedAt: response.headers.get('last-modified'),
    etag: response.headers.get('etag'),
    finalUrl: response.url,
  };
}

export async function discoverFinepPublicResources(): Promise<FinepPublicResource[]> {
  let pageUrl: string = PAGE_CANDIDATES[1];
  let discovered: Partial<Record<FinepResourceKind, string>> = {};
  for (const candidate of PAGE_CANDIDATES) {
    try {
      const { buffer, response } = await fetchBuffer(candidate, 25_000);
      const html = decodePage(buffer, response.headers.get('content-type'));
      const operations = resourceUrlFromPage(html, candidate, 'operations');
      const disbursements = resourceUrlFromPage(html, candidate, 'disbursements');
      if (operations && disbursements) {
        pageUrl = candidate;
        discovered = { operations, disbursements };
        break;
      }
    } catch {
      // Direct official download URLs remain the bounded fallback.
    }
  }

  const resources: FinepPublicResource[] = [];
  for (const kind of ['operations', 'disbursements'] as FinepResourceKind[]) {
    const url = discovered[kind] ?? DIRECT_RESOURCES[kind];
    const metadata = await probeResource(url);
    const referenceDate = metadata.modifiedAt ? new Date(metadata.modifiedAt).toISOString().slice(0, 10) : null;
    resources.push({
      kind,
      key: `finep:${kind}`,
      name: kind === 'operations' ? 'Finep operações contratadas' : 'Finep desembolsos das operações contratadas',
      url: metadata.finalUrl,
      pageUrl,
      referenceDate,
      modifiedAt: metadata.modifiedAt,
      etag: metadata.etag,
      format: 'xlsx',
    });
  }
  return resources;
}

function xmlText(value: string) {
  return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
}
function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? '';
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}
function cellValue(cell: string, sharedStrings: string[]) {
  const type = cell.match(/\bt=["']([^"']+)["']/i)?.[1] ?? '';
  if (type === 'inlineStr') return clean([...cell.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => xmlText(match[1] ?? '')).join(''));
  const raw = cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? '';
  if (type === 's') return sharedStrings[Number(raw)] ?? '';
  if (type === 'b') return raw === '1' ? 'true' : 'false';
  return clean(xmlText(raw));
}
function* sheetRows(xml: string, sharedStrings: string[]) {
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const values: string[] = [];
    for (const cellMatch of rowMatch[1]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const reference = cellMatch[1]!.match(/\br=["']([^"']+)["']/i)?.[1] ?? '';
      values[Math.max(0, columnIndex(reference))] = cellValue(`<c ${cellMatch[1]}>${cellMatch[2]}</c>`, sharedStrings);
    }
    if (values.some((value) => clean(value))) yield values.map((value) => clean(value ?? ''));
  }
}
function rowObject(headers: string[], values: string[]) {
  return Object.fromEntries(headers.map((header, index) => [normalizeFinepHeader(header), clean(values[index] ?? '')]));
}
function headerScore(values: string[]) {
  const normalized = values.map(normalizeFinepHeader);
  const joined = normalized.join('|');
  return Number(joined.includes('cnpj')) * 4
    + Number(joined.includes('contrato')) * 2
    + Number(joined.includes('valor')) * 2
    + Number(joined.includes('data'))
    + Number(joined.includes('proponente') || joined.includes('beneficiario'));
}
function extractEntry(archive: Buffer, entries: Map<string, ZipArchiveEntry>, name: string) {
  const entry = entries.get(name);
  if (!entry) throw new Error(`Finep XLSX entry not found: ${name}`);
  return extractZipArchiveEntry(archive, entry);
}
function workbookSheetList(archive: Buffer, entries: Map<string, ZipArchiveEntry>) {
  const workbook = extractEntry(archive, entries, 'xl/workbook.xml').toString('utf8');
  const relationships = extractEntry(archive, entries, 'xl/_rels/workbook.xml.rels').toString('utf8');
  const rels = new Map([...relationships.matchAll(/<Relationship\b[^>]*Id=["']([^"']+)["'][^>]*Target=["']([^"']+)["'][^>]*\/?>(?:<\/Relationship>)?/gi)]
    .map((match) => [match[1]!, match[2]!]));
  return [...workbook.matchAll(/<sheet\b[^>]*name=["']([^"']+)["'][^>]*(?:r:id|id)=["']([^"']+)["'][^>]*\/?>(?:<\/sheet>)?/gi)].flatMap((match) => {
    const target = rels.get(match[2]!);
    if (!target) return [];
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    return [{ name: xmlText(match[1]!), path: path.replace(/\/\.\//g, '/') }];
  });
}
function sharedStrings(archive: Buffer, entries: Map<string, ZipArchiveEntry>) {
  const entry = entries.get('xl/sharedStrings.xml');
  if (!entry) return [];
  const xml = extractZipArchiveEntry(archive, entry).toString('utf8');
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) =>
    clean([...match[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((item) => xmlText(item[1] ?? '')).join('')),
  );
}

export async function streamFinepPublicResource(input: {
  resource: FinepPublicResource;
  targetCnpjs: Set<string>;
  targetRoots: Set<string>;
  maxMatchedRows: number;
  onRecord: (record: FinepPublicRecord) => Promise<void>;
}): Promise<FinepStreamStats> {
  const { buffer } = await fetchBuffer(input.resource.url, 120_000);
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error(`Finep workbook is not a valid XLSX archive: ${input.resource.url}`);
  const listed = listZipArchiveEntries(buffer, {
    maxEntries: 5_000,
    maxEntryBytes: MAX_ENTRY_BYTES,
    maxTotalUncompressedBytes: MAX_TOTAL_UNCOMPRESSED_BYTES,
  });
  const entries = new Map(listed.map((entry) => [entry.name, entry]));
  const strings = sharedStrings(buffer, entries);
  const sheets = workbookSheetList(buffer, entries);
  const stats: FinepStreamStats = { rowsScanned: 0, recordsMatched: 0, sheetsScanned: 0, workbookEntries: listed.length };

  for (const sheet of sheets) {
    if (stats.recordsMatched >= input.maxMatchedRows) break;
    const category = classifyFinepSheet(sheet.name);
    if (!category) continue;
    const entry = entries.get(sheet.path);
    if (!entry) continue;
    const xml = extractZipArchiveEntry(buffer, entry).toString('utf8');
    let headers: string[] | null = null;
    for (const values of sheetRows(xml, strings)) {
      if (!headers) {
        if (headerScore(values) >= 6) headers = values.map(normalizeFinepHeader);
        continue;
      }
      stats.rowsScanned += 1;
      const record = normalizeFinepPublicRow({
        resource: input.resource,
        sheetName: sheet.name,
        category,
        row: rowObject(headers, values),
        targetCnpjs: input.targetCnpjs,
        targetRoots: input.targetRoots,
      });
      if (!record) continue;
      await input.onRecord(record);
      stats.recordsMatched += 1;
      if (stats.recordsMatched >= input.maxMatchedRows) break;
    }
    stats.sheetsScanned += 1;
  }
  if (!stats.sheetsScanned) throw new Error(`Finep workbook contained no supported data sheets: ${input.resource.name}`);
  return stats;
}
