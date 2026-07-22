import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  extractZipArchiveEntry,
  listZipArchiveEntries,
} from '../../lib/zipArchive.js';
import {
  digits,
  parseDelimitedText,
  type PublicBulkResource,
} from './publicBulkDatasetConnector.js';

export type StrategicPublicDatasetCode = 'rfb_qsa' | 'cvm_fre_capital_structure';

export type StrategicPublicRecord = {
  datasetCode: StrategicPublicDatasetCode;
  sourceCode: string;
  recordKey: string;
  entityCnpj: string;
  entityName: string | null;
  recordType: string;
  referenceDate: string | null;
  amount: number | null;
  status: string | null;
  sourceUrl: string;
  resourceKey: string;
  contentHash: string;
  rawPayload: Record<string, string>;
  normalizedPayload: Record<string, unknown>;
};

export type StrategicPublicStreamStats = {
  rowsScanned: number;
  recordsMatched: number;
  archiveEntries: number;
};

const SOURCE_CODES: Record<StrategicPublicDatasetCode, string> = {
  rfb_qsa: 'src_rfb_qsa_bulk',
  cvm_fre_capital_structure: 'src_cvm_fre_capital_structure',
};

const RFB_QSA_HEADERS = [
  'cnpj_basico',
  'identificador_socio',
  'nome_socio_razao_social',
  'cnpj_cpf_socio',
  'qualificacao_socio',
  'data_entrada_sociedade',
  'pais',
  'representante_legal',
  'nome_representante',
  'qualificacao_representante_legal',
  'faixa_etaria',
];

const CVM_FRE_ENTRY_TYPES: Array<{ pattern: RegExp; recordType: string }> = [
  { pattern: /fre_cia_aberta_endividamento/i, recordType: 'cvm_fre_debt_profile' },
  { pattern: /fre_cia_aberta_obrigacao/i, recordType: 'cvm_fre_obligation_schedule' },
  { pattern: /fre_cia_capital_social_aumento/i, recordType: 'cvm_fre_capital_increase' },
  { pattern: /fre_cia_capital_social_reducao/i, recordType: 'cvm_fre_capital_reduction' },
  { pattern: /fre_cia_aberta_transacao_parte_relacionada/i, recordType: 'cvm_fre_related_party_transaction' },
  { pattern: /fre_cia_aberta_posicao_acionaria/i, recordType: 'cvm_fre_ownership_position' },
  { pattern: /fre_cia_aberta_distribuicao_capital/i, recordType: 'cvm_fre_capital_distribution' },
];

const normalizeHeader = (value: string) => value
  .replace(/^\uFEFF/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashText = (value: string) => createHash('sha256').update(value).digest('hex');

const parseNumber = (value: unknown) => {
  const text = clean(value);
  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
    : text.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value: unknown) => {
  const text = clean(value);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const br = text.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
};

const pick = (row: Record<string, string>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value !== undefined && clean(value)) return clean(value);
  }
  return '';
};

const linksFromHtml = (html: string, base: string) => [...html.matchAll(/href=["']([^"']+)["']/gi)]
  .map((match) => {
    try {
      return new URL(match[1], base).toString();
    } catch {
      return null;
    }
  })
  .filter((value): value is string => Boolean(value));

const fetchText = async (url: string) => {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' },
  });
  if (!response.ok) throw new Error(`Discovery failed: ${response.status} ${url}`);
  return response.text();
};

async function probeResource(url: string) {
  const headers = { 'User-Agent': 'OriginationIntelligencePlatform/1.0' };
  let response = await fetch(url, { method: 'HEAD', redirect: 'follow', headers }).catch(() => null);
  if (!response?.ok) {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { ...headers, Range: 'bytes=0-0' },
    }).catch(() => null);
    await response?.body?.cancel().catch(() => undefined);
  }
  return {
    ok: Boolean(response?.ok),
    modifiedAt: response?.headers.get('last-modified') ?? null,
    etag: response?.headers.get('etag') ?? null,
  };
}

const targetMatch = (cnpj: string, targets: Set<string>, roots: Set<string>) => cnpj.length === 14
  ? targets.has(cnpj) || roots.has(cnpj.slice(0, 8))
  : roots.has(cnpj.slice(0, 8));

const rowObject = (headers: string[], values: string[]) => Object.fromEntries(
  headers.map((header, index) => [normalizeHeader(header), clean(values[index] ?? '')]),
);

const maskDocument = (value: string) => {
  const normalized = digits(value);
  if (!normalized) return '';
  if (normalized.length === 14) return `${normalized.slice(0, 8)}******`;
  return `***${normalized.slice(-4)}`;
};

const redactQsaRow = (row: Record<string, string>) => ({
  ...row,
  cnpj_cpf_socio: maskDocument(row.cnpj_cpf_socio),
  representante_legal: maskDocument(row.representante_legal),
});

export const classifyCvmFreEntry = (entryName: string) => CVM_FRE_ENTRY_TYPES
  .find(({ pattern }) => pattern.test(entryName))?.recordType ?? null;

export const isStrategicArchiveEntry = (
  datasetCode: StrategicPublicDatasetCode,
  entryName: string,
  archiveEntryPattern?: string,
) => {
  if (entryName.endsWith('/')) return false;
  const pattern = archiveEntryPattern ? new RegExp(archiveEntryPattern, 'i') : null;
  if (datasetCode === 'rfb_qsa') {
    return /(Socios|SOCIOCSV|SOCIO)/i.test(entryName) && (!pattern || pattern.test(entryName));
  }
  if (!/\.(csv|txt)$/i.test(entryName)) return false;
  return Boolean(classifyCvmFreEntry(entryName)) && (!pattern || pattern.test(entryName));
};

export async function discoverStrategicPublicResources(
  datasetCode: StrategicPublicDatasetCode,
  options: { reference?: string; maxResources?: number } = {},
): Promise<PublicBulkResource[]> {
  const maxResources = Math.max(1, Math.min(options.maxResources ?? 20, 100));

  if (datasetCode === 'rfb_qsa') {
    const rootUrl = 'https://arquivos.receitafederal.gov.br/cnpj/dados_abertos_cnpj/';
    const folders = linksFromHtml(await fetchText(rootUrl), rootUrl)
      .filter((url) => /\/20\d{2}-\d{2}\/$/.test(url))
      .sort()
      .reverse();
    const wanted = options.reference?.slice(0, 7).replace('/', '-');
    const folder = wanted ? folders.find((url) => url.includes(`${wanted}/`)) : folders[0];
    if (!folder) throw new Error('RFB monthly CNPJ folder was not found for QSA.');

    const resources = linksFromHtml(await fetchText(folder), folder)
      .filter((url) => /Socios\d*\.zip$/i.test(url))
      .slice(0, maxResources);
    if (!resources.length) throw new Error('RFB folder returned no Socios ZIP resources.');

    const month = folder.match(/(20\d{2}-\d{2})\/$/)?.[1] ?? wanted ?? '';
    return resources.map((url) => ({
      key: `rfb-qsa:${basename(url)}`,
      name: basename(url),
      url,
      format: 'zip',
      encoding: 'latin1',
      delimiter: ';',
      referenceDate: month ? `${month}-01` : null,
      archiveEntryPattern: '(Socios|SOCIOCSV|SOCIO)',
    }));
  }

  const explicitYear = Number(options.reference?.slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  const candidateYears = Number.isInteger(explicitYear) && explicitYear >= 2000
    ? [explicitYear]
    : [currentYear, currentYear - 1];
  const resources: PublicBulkResource[] = [];

  for (const year of candidateYears) {
    if (resources.length >= maxResources) break;
    const url = `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/fre_cia_aberta_${year}.zip`;
    const metadata = await probeResource(url);
    if (!metadata.ok) continue;
    resources.push({
      key: `cvm-fre:${year}`,
      name: `FRE companhias abertas ${year}`,
      url,
      format: 'zip',
      encoding: 'latin1',
      delimiter: ';',
      referenceDate: `${year}-01-01`,
      modifiedAt: metadata.modifiedAt,
      etag: metadata.etag,
      archiveEntryPattern: '(endividamento|obrigacao|capital_social_aumento|capital_social_reducao|transacao_parte_relacionada|posicao_acionaria|distribuicao_capital)',
    });
  }

  if (!resources.length) throw new Error('CVM FRE current/previous yearly archives were not available.');
  return resources;
}

export function normalizeStrategicPublicRow(input: {
  datasetCode: StrategicPublicDatasetCode;
  row: Record<string, string>;
  resource: PublicBulkResource;
  entryName: string;
  targetCnpjs: Set<string>;
  targetRoots: Set<string>;
}): StrategicPublicRecord | null {
  const { datasetCode, row, resource, entryName, targetCnpjs, targetRoots } = input;

  if (datasetCode === 'rfb_qsa') {
    const entityCnpj = digits(row.cnpj_basico).padStart(8, '0');
    if (entityCnpj.length !== 8 || !targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;

    const partnerDocument = digits(row.cnpj_cpf_socio);
    const partnerDocumentHash = partnerDocument ? hashText(partnerDocument) : hashText(`${entityCnpj}|${row.nome_socio_razao_social}`);
    const partnerType = partnerDocument.length === 14
      ? 'legal_entity'
      : partnerDocument.length === 11 ? 'natural_person' : 'undisclosed';
    const partnerName = clean(row.nome_socio_razao_social);
    const entryDate = parseDate(row.data_entrada_sociedade);
    const normalizedPayload = {
      summary: `Quadro societário RFB · ${partnerName || 'sócio não identificado'} · qualificação ${clean(row.qualificacao_socio) || 'não informada'}`,
      partnerName: partnerName || null,
      partnerType,
      partnerDocumentMasked: maskDocument(partnerDocument),
      partnerDocumentHash,
      qualificationCode: clean(row.qualificacao_socio) || null,
      partnerIdentifier: clean(row.identificador_socio) || null,
      entryDate,
      countryCode: clean(row.pais) || null,
      ageRange: clean(row.faixa_etaria) || null,
      representativeName: clean(row.nome_representante) || null,
      representativeQualificationCode: clean(row.qualificacao_representante_legal) || null,
      privacyTreatment: 'natural-person identifiers masked and fingerprinted before persistence',
    };
    const recordKey = hash({
      datasetCode,
      resource: resource.key,
      entityCnpj,
      partnerDocumentHash,
      qualificationCode: row.qualificacao_socio,
      entryDate,
    });
    const rawPayload = redactQsaRow(row);
    return {
      datasetCode,
      sourceCode: SOURCE_CODES[datasetCode],
      recordKey,
      entityCnpj,
      entityName: null,
      recordType: 'rfb_partner_snapshot',
      referenceDate: resource.referenceDate,
      amount: null,
      status: clean(row.identificador_socio) || null,
      sourceUrl: resource.url,
      resourceKey: resource.key,
      contentHash: hash({ rawPayload, normalizedPayload }),
      rawPayload,
      normalizedPayload,
    };
  }

  const recordType = classifyCvmFreEntry(entryName);
  if (!recordType) return null;
  const entityCnpj = digits(pick(row, [
    'cnpj_cia',
    'cnpj_companhia',
    'cnpj_emissor',
    'cnpj',
  ]));
  if (entityCnpj.length !== 14 || !targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;

  const entityName = pick(row, ['denom_cia', 'nome_companhia', 'denominacao_social', 'nome_emissor']);
  const referenceDate = parseDate(pick(row, [
    'data_referencia',
    'dt_refer',
    'data_exercicio_social',
    'data_entrega',
    'data_alteracao',
    'data_aprovacao',
    'data_vencimento',
  ])) ?? resource.referenceDate;
  const amount = parseNumber(pick(row, [
    'valor_total',
    'valor_obrigacao',
    'valor_divida',
    'saldo_devedor',
    'valor_operacao',
    'montante',
    'valor_aumento',
    'valor_reducao',
    'valor_transacao',
    'valor',
  ]));
  const status = pick(row, ['situacao', 'status', 'tipo', 'categoria', 'especie']);
  const description = pick(row, [
    'descricao',
    'descricao_obrigacao',
    'descricao_transacao',
    'caracteristica',
    'observacao',
    'justificativa',
  ]);
  const counterpart = pick(row, [
    'parte_relacionada',
    'nome_parte_relacionada',
    'credor',
    'acionista',
    'contraparte',
  ]);
  const maturityDate = parseDate(pick(row, ['data_vencimento', 'dt_vencimento', 'vencimento']));
  const normalizedPayload = {
    summary: `${entityName || entityCnpj} · ${recordType.replaceAll('_', ' ')}${amount !== null ? ` · R$ ${amount.toFixed(2)}` : ''}`,
    sourceSection: recordType,
    entryName,
    description: description || null,
    counterpart: counterpart || null,
    maturityDate,
    instrument: pick(row, ['instrumento', 'tipo_instrumento', 'especie', 'modalidade']) || null,
    indexer: pick(row, ['indexador', 'indice_correcao', 'remuneracao']) || null,
    rate: parseNumber(pick(row, ['taxa_juros', 'taxa', 'remuneracao_percentual'])),
    currency: pick(row, ['moeda', 'codigo_moeda']) || null,
    sequence: pick(row, ['id_documento', 'numero_sequencial_documento', 'versao', 'ordem']) || null,
  };
  const identity = {
    datasetCode,
    resource: resource.key,
    recordType,
    entityCnpj,
    referenceDate,
    amount,
    status,
    description,
    counterpart,
    sequence: normalizedPayload.sequence,
  };

  return {
    datasetCode,
    sourceCode: SOURCE_CODES[datasetCode],
    recordKey: hash(identity),
    entityCnpj,
    entityName: entityName || null,
    recordType,
    referenceDate,
    amount,
    status: status || null,
    sourceUrl: resource.url,
    resourceKey: resource.key,
    contentHash: hash({ row, normalizedPayload }),
    rawPayload: row,
    normalizedPayload,
  };
}

async function* decodeNode(stream: NodeJS.ReadableStream, encoding: string) {
  const decoder = new TextDecoder(encoding);
  for await (const chunk of stream as AsyncIterable<Buffer>) yield decoder.decode(chunk, { stream: true });
  const tail = decoder.decode();
  if (tail) yield tail;
}

async function* decodeBuffer(buffer: Buffer, encoding: string) {
  yield new TextDecoder(encoding).decode(buffer);
}

const commandOutput = (command: string, args: string[]) => new Promise<string>((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => { out += chunk.toString(); });
  child.stderr.on('data', (chunk) => { err += chunk.toString(); });
  child.on('error', reject);
  child.on('close', (code) => code === 0
    ? resolve(out)
    : reject(new Error(`${command} exited ${code}: ${err}`)));
});

async function consumeRows(input: {
  datasetCode: StrategicPublicDatasetCode;
  resource: PublicBulkResource;
  entryName: string;
  rows: AsyncIterable<string[]>;
  targetCnpjs: Set<string>;
  targetRoots: Set<string>;
  maxMatchedRows: number;
  onRecord: (record: StrategicPublicRecord) => Promise<void>;
  stats: StrategicPublicStreamStats;
}) {
  let headers: string[] | null = input.datasetCode === 'rfb_qsa' ? RFB_QSA_HEADERS : null;
  for await (const values of input.rows) {
    if (!headers) {
      headers = values.map(normalizeHeader);
      continue;
    }
    input.stats.rowsScanned += 1;
    const record = normalizeStrategicPublicRow({
      datasetCode: input.datasetCode,
      row: rowObject(headers, values),
      resource: input.resource,
      entryName: input.entryName,
      targetCnpjs: input.targetCnpjs,
      targetRoots: input.targetRoots,
    });
    if (!record) continue;
    await input.onRecord(record);
    input.stats.recordsMatched += 1;
    if (input.stats.recordsMatched >= input.maxMatchedRows) break;
  }
}

async function streamCvmFreInMemory(input: {
  datasetCode: StrategicPublicDatasetCode;
  resource: PublicBulkResource;
  targetCnpjs: Set<string>;
  targetRoots: Set<string>;
  maxMatchedRows: number;
  onRecord: (record: StrategicPublicRecord) => Promise<void>;
}, response: Response, stats: StrategicPublicStreamStats) {
  const archive = Buffer.from(await response.arrayBuffer());
  const entries = listZipArchiveEntries(archive, {
    maxEntries: 500,
    maxEntryBytes: 64 * 1024 * 1024,
    maxTotalUncompressedBytes: 256 * 1024 * 1024,
  }).filter((entry) => isStrategicArchiveEntry(
    input.datasetCode,
    entry.name,
    input.resource.archiveEntryPattern,
  ));
  if (!entries.length) throw new Error(`Archive contains no compatible strategic entries: ${input.resource.name}`);

  for (const entry of entries) {
    if (stats.recordsMatched >= input.maxMatchedRows) break;
    const extracted = extractZipArchiveEntry(archive, entry);
    const rows = parseDelimitedText(decodeBuffer(extracted, input.resource.encoding), input.resource.delimiter);
    await consumeRows({ ...input, entryName: entry.name, rows, stats });
    stats.archiveEntries += 1;
  }
  return stats;
}

export async function streamStrategicPublicResource(input: {
  datasetCode: StrategicPublicDatasetCode;
  resource: PublicBulkResource;
  targetCnpjs: Set<string>;
  targetRoots: Set<string>;
  maxMatchedRows: number;
  onRecord: (record: StrategicPublicRecord) => Promise<void>;
}): Promise<StrategicPublicStreamStats> {
  const stats: StrategicPublicStreamStats = { rowsScanned: 0, recordsMatched: 0, archiveEntries: 0 };
  const response = await fetch(input.resource.url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' },
  });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${input.resource.url}`);

  if (input.datasetCode === 'cvm_fre_capital_structure') {
    return streamCvmFreInMemory(input, response, stats);
  }
  if (!response.body) throw new Error(`Archive response did not include a body: ${input.resource.url}`);

  const directory = await mkdtemp(join(tmpdir(), 'origination-strategic-data-'));
  const archive = join(directory, 'resource.zip');
  try {
    await pipeline(Readable.fromWeb(response.body as any), createWriteStream(archive));
    const allEntries = (await commandOutput('unzip', ['-Z1', archive]))
      .split(/\r?\n/)
      .filter(Boolean);
    const entries = allEntries.filter((entry) => isStrategicArchiveEntry(
      input.datasetCode,
      entry,
      input.resource.archiveEntryPattern,
    ));
    if (!entries.length) throw new Error(`Archive contains no compatible strategic entries: ${input.resource.name}`);

    for (const entry of entries) {
      if (stats.recordsMatched >= input.maxMatchedRows) break;
      const child = spawn('unzip', ['-p', archive, entry], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      const rows = parseDelimitedText(decodeNode(child.stdout, input.resource.encoding), input.resource.delimiter);
      await consumeRows({ ...input, entryName: entry, rows, stats });
      const code = await new Promise<number | null>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      if (code !== 0) throw new Error(`unzip failed for ${entry}: ${stderr}`);
      stats.archiveEntries += 1;
    }

    return stats;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
