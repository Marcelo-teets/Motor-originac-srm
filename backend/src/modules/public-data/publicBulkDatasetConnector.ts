import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type PublicBulkDatasetCode =
  | 'rfb_cnpj'
  | 'pgfn_debt'
  | 'bndes_financing_operations'
  | 'cgu_ceis'
  | 'cgu_cnep'
  | 'compras_contracts';

export type PublicBulkResource = {
  key: string;
  name: string;
  url: string;
  format: 'csv' | 'zip' | 'gzip';
  encoding: 'utf-8' | 'windows-1252' | 'latin1';
  delimiter: ',' | ';';
  referenceDate: string | null;
  modifiedAt?: string | null;
  etag?: string | null;
  archiveEntryPattern?: string;
};

export type PublicBulkRecord = {
  datasetCode: PublicBulkDatasetCode;
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

export type PublicBulkStreamStats = {
  rowsScanned: number;
  recordsMatched: number;
  archiveEntries: number;
};

const DATASET_SOURCE_CODES: Record<PublicBulkDatasetCode, string> = {
  rfb_cnpj: 'src_rfb_cnpj_bulk',
  pgfn_debt: 'src_pgfn_divida_ativa_bulk',
  bndes_financing_operations: 'src_bndes_financing_operations',
  cgu_ceis: 'src_cgu_transparencia_bulk',
  cgu_cnep: 'src_cgu_transparencia_bulk',
  compras_contracts: 'src_compras_gov_contracts',
};

const RFB_COMPANY_HEADERS = [
  'cnpj_basico', 'razao_social', 'natureza_juridica', 'qualificacao_responsavel',
  'capital_social', 'porte_empresa', 'ente_federativo_responsavel',
];
const RFB_ESTABLISHMENT_HEADERS = [
  'cnpj_basico', 'cnpj_ordem', 'cnpj_dv', 'identificador_matriz_filial', 'nome_fantasia',
  'situacao_cadastral', 'data_situacao_cadastral', 'motivo_situacao_cadastral',
  'nome_cidade_exterior', 'pais', 'data_inicio_atividade', 'cnae_fiscal_principal',
  'cnae_fiscal_secundaria', 'tipo_logradouro', 'logradouro', 'numero', 'complemento',
  'bairro', 'cep', 'uf', 'municipio', 'ddd1', 'telefone1', 'ddd2', 'telefone2',
  'ddd_fax', 'fax', 'correio_eletronico', 'situacao_especial', 'data_situacao_especial',
];

const normalizeHeader = (value: string) => value
  .replace(/^\uFEFF/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

export const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const cleanText = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const hashJson = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const parseNumber = (value: unknown) => {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value: unknown) => {
  const text = cleanText(value);
  if (!text) return null;
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
    if (value !== undefined && cleanText(value)) return cleanText(value);
  }
  return '';
};

const relativeLinks = (html: string, baseUrl: string) => [...html.matchAll(/href=["']([^"']+)["']/gi)]
  .map((match) => {
    try { return new URL(match[1], baseUrl).toString(); } catch { return null; }
  })
  .filter((value): value is string => Boolean(value));

const fetchText = async (url: string) => {
  const response = await fetch(url, { headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' } });
  if (!response.ok) throw new Error(`Resource discovery failed: ${response.status} ${url}`);
  return response.text();
};

const headMetadata = async (url: string) => {
  const response = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' },
  });
  return {
    ok: response.ok,
    modifiedAt: response.headers.get('last-modified'),
    etag: response.headers.get('etag'),
  };
};

const dateString = (date: Date) => date.toISOString().slice(0, 10).replaceAll('-', '');
const monthString = (date: Date) => date.toISOString().slice(0, 7).replace('-', '');

async function discoverDatedPortalResource(slug: string, reference?: string) {
  const candidates: string[] = [];
  if (reference && /^\d{8}$/.test(reference)) candidates.push(reference);
  for (let offset = 0; offset < 20; offset += 1) {
    const date = new Date(Date.now() - offset * 86_400_000);
    candidates.push(dateString(date));
  }
  for (const candidate of [...new Set(candidates)]) {
    const url = `https://portaldatransparencia.gov.br/download-de-dados/${slug}/${candidate}`;
    const metadata = await headMetadata(url).catch(() => ({ ok: false, modifiedAt: null, etag: null }));
    if (metadata.ok) return { url, referenceDate: `${candidate.slice(0, 4)}-${candidate.slice(4, 6)}-${candidate.slice(6, 8)}`, ...metadata };
  }
  throw new Error(`No recent Portal da Transparência archive found for ${slug}.`);
}

async function discoverMonthlyPortalResource(slug: string, reference?: string) {
  const candidates: string[] = [];
  if (reference && /^\d{6}$/.test(reference.replace('-', ''))) candidates.push(reference.replace('-', ''));
  for (let offset = 0; offset < 8; offset += 1) {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() - offset);
    candidates.push(monthString(date));
  }
  for (const candidate of [...new Set(candidates)]) {
    const url = `https://portaldatransparencia.gov.br/download-de-dados/${slug}/${candidate}`;
    const metadata = await headMetadata(url).catch(() => ({ ok: false, modifiedAt: null, etag: null }));
    if (metadata.ok) return { url, referenceDate: `${candidate.slice(0, 4)}-${candidate.slice(4, 6)}-01`, ...metadata };
  }
  throw new Error(`No recent Portal da Transparência monthly archive found for ${slug}.`);
}

export async function discoverPublicBulkResources(
  datasetCode: PublicBulkDatasetCode,
  options: { reference?: string; maxResources?: number } = {},
): Promise<PublicBulkResource[]> {
  const maxResources = Math.max(1, Math.min(options.maxResources ?? 20, 100));

  if (datasetCode === 'bndes_financing_operations') {
    const response = await fetch('https://dadosabertos.bndes.gov.br/api/3/action/package_show?id=operacoes-financiamento');
    if (!response.ok) throw new Error(`BNDES CKAN discovery failed: ${response.status}`);
    const payload = await response.json() as { success?: boolean; result?: { resources?: Array<Record<string, unknown>> } };
    const resources = (payload.result?.resources ?? [])
      .filter((resource) => String(resource.format ?? '').toUpperCase() === 'CSV')
      .filter((resource) => /operac/i.test(String(resource.name ?? '')))
      .slice(0, maxResources)
      .map((resource) => ({
        key: String(resource.id ?? resource.url),
        name: String(resource.name ?? 'BNDES CSV'),
        url: String(resource.url),
        format: 'csv' as const,
        encoding: 'windows-1252' as const,
        delimiter: ';' as const,
        referenceDate: parseDate(resource.last_modified) ?? new Date().toISOString().slice(0, 10),
        modifiedAt: String(resource.last_modified ?? ''),
        etag: String(resource.hash ?? ''),
      }));
    if (!resources.length) throw new Error('BNDES CKAN returned no financing CSV resources.');
    return resources;
  }

  if (datasetCode === 'pgfn_debt') {
    const pageUrl = 'https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos';
    const html = await fetchText(pageUrl);
    const links = relativeLinks(html, pageUrl)
      .filter((url) => /\.(zip|csv)(\?|$)/i.test(url) || /dados-abertos.*(sida|fgts|divida)/i.test(url));
    const reference = options.reference?.replace(/[^0-9]/g, '');
    const filtered = reference ? links.filter((url) => url.includes(reference)) : links;
    const selected = (filtered.length ? filtered : links).slice(0, maxResources);
    if (!selected.length) throw new Error('PGFN page returned no downloadable open-data resources.');
    return selected.map((url, index) => ({
      key: `pgfn:${hashJson(url).slice(0, 24)}`,
      name: `PGFN dívida ativa ${index + 1}`,
      url,
      format: /\.csv(\?|$)/i.test(url) ? 'csv' : 'zip',
      encoding: 'windows-1252',
      delimiter: ';',
      referenceDate: options.reference ? `${options.reference.slice(0, 7)}-01` : new Date().toISOString().slice(0, 10),
    }));
  }

  if (datasetCode === 'rfb_cnpj') {
    const rootUrl = 'https://arquivos.receitafederal.gov.br/cnpj/dados_abertos_cnpj/';
    const rootHtml = await fetchText(rootUrl);
    const folders = relativeLinks(rootHtml, rootUrl)
      .filter((url) => /\/20\d{2}-\d{2}\/$/.test(url))
      .sort().reverse();
    const folder = options.reference
      ? folders.find((url) => url.includes(`${options.reference.replace('/', '-')}/`))
      : folders[0];
    if (!folder) throw new Error('RFB monthly CNPJ folder was not found.');
    const html = await fetchText(folder);
    const links = relativeLinks(html, folder)
      .filter((url) => /\.(zip|csv)$/.test(url))
      .filter((url) => /(Empresas|Estabelecimentos)/i.test(url))
      .slice(0, maxResources);
    if (!links.length) throw new Error('RFB folder returned no Empresas/Estabelecimentos archives.');
    const folderReference = folder.match(/(20\d{2}-\d{2})\/$/)?.[1] ?? options.reference ?? '';
    return links.map((url) => ({
      key: `rfb:${basename(url)}`,
      name: basename(url),
      url,
      format: /\.csv$/i.test(url) ? 'csv' : 'zip',
      encoding: 'latin1',
      delimiter: ';',
      referenceDate: folderReference ? `${folderReference}-01` : null,
      archiveEntryPattern: '(Empresas|Estabelecimentos)',
    }));
  }

  if (datasetCode === 'cgu_ceis' || datasetCode === 'cgu_cnep') {
    const slug = datasetCode === 'cgu_ceis' ? 'ceis' : 'cnep';
    const resource = await discoverDatedPortalResource(slug, options.reference);
    return [{
      key: `${slug}:${resource.referenceDate}`,
      name: `CGU ${slug.toUpperCase()} ${resource.referenceDate}`,
      url: resource.url,
      format: 'zip',
      encoding: 'windows-1252',
      delimiter: ';',
      referenceDate: resource.referenceDate,
      modifiedAt: resource.modifiedAt,
      etag: resource.etag,
      archiveEntryPattern: slug,
    }];
  }

  const resource = await discoverMonthlyPortalResource('contratos', options.reference);
  return [{
    key: `compras-contracts:${resource.referenceDate}`,
    name: `Contratos públicos ${resource.referenceDate}`,
    url: resource.url,
    format: 'zip',
    encoding: 'windows-1252',
    delimiter: ';',
    referenceDate: resource.referenceDate,
    modifiedAt: resource.modifiedAt,
    etag: resource.etag,
    archiveEntryPattern: 'contrat',
  }];
}

export async function* parseDelimitedText(chunks: AsyncIterable<string>, delimiter: string): AsyncGenerator<string[]> {
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let pendingQuote = false;

  for await (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index];
      if (inQuotes) {
        if (pendingQuote) {
          if (char === '"') {
            field += '"';
            pendingQuote = false;
            continue;
          }
          inQuotes = false;
          pendingQuote = false;
        }
        if (inQuotes) {
          if (char === '"') pendingQuote = true;
          else field += char;
          continue;
        }
      }
      if (char === '"' && field.length === 0) inQuotes = true;
      else if (char === delimiter) { row.push(field); field = ''; }
      else if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        if (row.some((value) => value.length > 0)) yield row;
        row = [];
        field = '';
      } else if (char !== '\r') field += char;
    }
  }
  if (pendingQuote) inQuotes = false;
  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value.length > 0)) yield row;
  }
}

async function* decodeWebBody(response: Response, encoding: string) {
  if (!response.body) throw new Error(`Empty response body for ${response.url}`);
  const decoder = new TextDecoder(encoding);
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

async function* decodeNodeBody(stream: NodeJS.ReadableStream, encoding: string) {
  const decoder = new TextDecoder(encoding);
  for await (const chunk of stream as AsyncIterable<Buffer>) yield decoder.decode(chunk, { stream: true });
  const tail = decoder.decode();
  if (tail) yield tail;
}

const commandOutput = async (command: string, args: string[]) => new Promise<string>((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr}`)));
});

const rowsFromNodeStream = async function* (
  stream: NodeJS.ReadableStream,
  encoding: string,
  delimiter: string,
) {
  yield* parseDelimitedText(decodeNodeBody(stream, encoding), delimiter);
};

const rfbHeaders = (name: string) => /estabele/i.test(name) ? RFB_ESTABLISHMENT_HEADERS : RFB_COMPANY_HEADERS;

const rowObject = (headers: string[], values: string[]) => Object.fromEntries(
  headers.map((header, index) => [normalizeHeader(header), cleanText(values[index] ?? '')]),
);

const targetMatch = (cnpj: string, targetCnpjs: Set<string>, targetRoots: Set<string>) => (
  cnpj.length === 14 ? targetCnpjs.has(cnpj) || targetRoots.has(cnpj.slice(0, 8)) : targetRoots.has(cnpj.slice(0, 8))
);

export function normalizePublicBulkRow(input: {
  datasetCode: PublicBulkDatasetCode;
  row: Record<string, string>;
  resource: PublicBulkResource;
  targetCnpjs: Set<string>;
  targetRoots: Set<string>;
}): PublicBulkRecord | null {
  const { datasetCode, row, resource, targetCnpjs, targetRoots } = input;
  let entityCnpj = '';
  let entityName = '';
  let recordType = '';
  let referenceDate = resource.referenceDate;
  let amount: number | null = null;
  let status = '';
  let identity: Record<string, unknown> = {};
  let normalizedPayload: Record<string, unknown> = {};

  if (datasetCode === 'bndes_financing_operations') {
    entityCnpj = digits(pick(row, ['cpf_cnpj', 'cpf/cnpj']));
    if (entityCnpj.length !== 14 || !targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;
    entityName = pick(row, ['cliente']);
    recordType = 'bndes_financing';
    referenceDate = parseDate(pick(row, ['data_da_contratacao', 'data da contratacao'])) ?? referenceDate;
    amount = parseNumber(pick(row, ['valor_da_operacao_em_reais', 'valor da operacao em reais']));
    status = pick(row, ['situacao_da_operacao', 'situacao da operacao']);
    normalizedPayload = {
      summary: `${entityName} · operação BNDES${amount !== null ? ` · R$ ${amount.toFixed(2)}` : ''}`,
      disbursedAmount: parseNumber(pick(row, ['valor_desembolsado_reais'])),
      financialCost: pick(row, ['custo_financeiro']),
      interestRate: parseNumber(pick(row, ['juros'])),
      graceMonths: parseNumber(pick(row, ['prazo_carencia_meses'])),
      amortizationMonths: parseNumber(pick(row, ['prazo_amortizacao_meses'])),
      product: pick(row, ['produto']),
      instrument: pick(row, ['instrumento_financeiro']),
      customerSize: pick(row, ['porte_do_cliente']),
      financialAgent: pick(row, ['instituicao_financeira_credenciada']),
    };
    identity = { entityCnpj, referenceDate, amount, product: normalizedPayload.product, instrument: normalizedPayload.instrument };
  } else if (datasetCode === 'pgfn_debt') {
    entityCnpj = digits(pick(row, ['cpf_cnpj', 'cpf/cnpj', 'cpf ou cnpj', 'numero_documento']));
    if (entityCnpj.length !== 14 || !targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;
    entityName = pick(row, ['nome_devedor', 'nome do devedor', 'devedor']);
    recordType = 'pgfn_debt';
    referenceDate = parseDate(pick(row, ['data_inscricao', 'data da inscricao'])) ?? referenceDate;
    amount = parseNumber(pick(row, ['valor_consolidado', 'valor consolidado', 'valor']));
    status = pick(row, ['situacao_inscricao', 'situacao da inscricao', 'situacao']);
    const registration = pick(row, ['numero_inscricao', 'numero da inscricao', 'inscricao']);
    normalizedPayload = {
      summary: `${entityName || entityCnpj} · dívida ativa${amount !== null ? ` · R$ ${amount.toFixed(2)}` : ''} · ${status}`,
      registration,
      debtType: pick(row, ['tipo_credito', 'tipo de credito', 'tipo_de_divida']),
      debtorRole: pick(row, ['tipo_devedor', 'tipo do devedor']),
      responsibleUnit: pick(row, ['unidade_responsavel', 'uf_unidade_responsavel']),
    };
    identity = { entityCnpj, registration, referenceDate, amount, status };
  } else if (datasetCode === 'cgu_ceis' || datasetCode === 'cgu_cnep') {
    entityCnpj = digits(pick(row, ['cpf_cnpj_sancionado', 'cpf ou cnpj do sancionado', 'cpf_cnpj', 'documento']));
    if (entityCnpj.length !== 14 || !targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;
    entityName = pick(row, ['nome_sancionado', 'nome do sancionado', 'razao_social']);
    recordType = datasetCode;
    referenceDate = parseDate(pick(row, ['data_inicio_sancao', 'data inicio sancao', 'data_inicio'])) ?? referenceDate;
    amount = parseNumber(pick(row, ['valor_multa', 'valor da multa']));
    status = pick(row, ['situacao', 'status']);
    const category = pick(row, ['categoria_sancao', 'categoria da sancao', 'tipo_sancao']);
    const sanctioningBody = pick(row, ['orgao_sancionador', 'orgao sancionador']);
    normalizedPayload = {
      summary: `${entityName || entityCnpj} · ${datasetCode === 'cgu_ceis' ? 'CEIS' : 'CNEP'} · ${category}`,
      category,
      sanctioningBody,
      startDate: referenceDate,
      endDate: parseDate(pick(row, ['data_final_sancao', 'data fim sancao', 'data_final'])),
      legalBasis: pick(row, ['fundamentacao_legal', 'fundamentacao legal']),
    };
    identity = { entityCnpj, category, sanctioningBody, referenceDate };
  } else if (datasetCode === 'compras_contracts') {
    entityCnpj = digits(pick(row, ['cnpj_contratado', 'cpf_cnpj_fornecedor', 'cpf/cnpj fornecedor', 'documento fornecedor']));
    if (entityCnpj.length !== 14 || !targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;
    entityName = pick(row, ['nome_contratado', 'nome_fornecedor', 'razao_social_fornecedor']);
    recordType = 'public_contract';
    referenceDate = parseDate(pick(row, ['data_assinatura', 'data assinatura', 'data_inicio_vigencia'])) ?? referenceDate;
    amount = parseNumber(pick(row, ['valor_global', 'valor contrato', 'valor_contrato']));
    status = pick(row, ['situacao', 'status_contrato']);
    const contractNumber = pick(row, ['numero_contrato', 'numero do contrato', 'contrato']);
    normalizedPayload = {
      summary: `${entityName || entityCnpj} · contrato público ${contractNumber}${amount !== null ? ` · R$ ${amount.toFixed(2)}` : ''}`,
      contractNumber,
      object: pick(row, ['objeto', 'objeto_contrato']),
      contractingBody: pick(row, ['orgao_superior', 'orgao_contratante', 'unidade_gestora']),
      endDate: parseDate(pick(row, ['data_fim_vigencia', 'data final vigencia'])),
    };
    identity = { entityCnpj, contractNumber, referenceDate, amount };
  } else {
    const basic = digits(row.cnpj_basico).padStart(8, '0');
    const isEstablishment = Boolean(row.cnpj_ordem || row.cnpj_dv);
    entityCnpj = isEstablishment ? `${basic}${digits(row.cnpj_ordem).padStart(4, '0')}${digits(row.cnpj_dv).padStart(2, '0')}` : basic;
    if (!targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;
    entityName = cleanText(isEstablishment ? row.nome_fantasia : row.razao_social);
    recordType = isEstablishment ? 'rfb_establishment_snapshot' : 'rfb_company_snapshot';
    status = isEstablishment ? cleanText(row.situacao_cadastral) : '';
    amount = isEstablishment ? null : parseNumber(row.capital_social);
    normalizedPayload = isEstablishment ? {
      summary: `${entityName || entityCnpj} · estabelecimento RFB · situação ${status}`,
      branchType: row.identificador_matriz_filial,
      registrationStatus: status,
      statusDate: parseDate(row.data_situacao_cadastral),
      activityStartDate: parseDate(row.data_inicio_atividade),
      primaryCnae: row.cnae_fiscal_principal,
      state: row.uf,
      municipalityCode: row.municipio,
    } : {
      summary: `${entityName || entityCnpj} · empresa RFB${amount !== null ? ` · capital R$ ${amount.toFixed(2)}` : ''}`,
      legalNature: row.natureza_juridica,
      capitalSocial: amount,
      companySize: row.porte_empresa,
    };
    identity = { entityCnpj, recordType, referenceDate };
  }

  const recordKey = hashJson({ datasetCode, resource: resource.key, ...identity });
  const rawPayload = row;
  const contentHash = hashJson({ rawPayload, normalizedPayload });
  return {
    datasetCode,
    sourceCode: DATASET_SOURCE_CODES[datasetCode],
    recordKey,
    entityCnpj,
    entityName: entityName || null,
    recordType,
    referenceDate,
    amount,
    status: status || null,
    sourceUrl: resource.url,
    resourceKey: resource.key,
    contentHash,
    rawPayload,
    normalizedPayload,
  };
}

async function processRows(input: {
  datasetCode: PublicBulkDatasetCode;
  resource: PublicBulkResource;
  rows: AsyncIterable<string[]>;
  entryName: string;
  targetCnpjs: Set<string>;
  targetRoots: Set<string>;
  maxMatchedRows: number;
  onRecord: (record: PublicBulkRecord) => Promise<void>;
  stats: PublicBulkStreamStats;
}) {
  let headers: string[] | null = input.datasetCode === 'rfb_cnpj' ? rfbHeaders(input.entryName) : null;
  for await (const values of input.rows) {
    if (!headers) {
      headers = values.map(normalizeHeader);
      continue;
    }
    input.stats.rowsScanned += 1;
    const record = normalizePublicBulkRow({
      datasetCode: input.datasetCode,
      row: rowObject(headers, values),
      resource: input.resource,
      targetCnpjs: input.targetCnpjs,
      targetRoots: input.targetRoots,
    });
    if (!record) continue;
    await input.onRecord(record);
    input.stats.recordsMatched += 1;
    if (input.stats.recordsMatched >= input.maxMatchedRows) break;
  }
}

export async function streamPublicBulkResource(input: {
  datasetCode: PublicBulkDatasetCode;
  resource: PublicBulkResource;
  targetCnpjs: Set<string>;
  targetRoots: Set<string>;
  maxMatchedRows: number;
  onRecord: (record: PublicBulkRecord) => Promise<void>;
}): Promise<PublicBulkStreamStats> {
  const stats: PublicBulkStreamStats = { rowsScanned: 0, recordsMatched: 0, archiveEntries: 0 };
  const response = await fetch(input.resource.url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' },
  });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${input.resource.url}`);

  if (input.resource.format === 'csv') {
    await processRows({
      ...input,
      entryName: input.resource.name,
      rows: parseDelimitedText(decodeWebBody(response, input.resource.encoding), input.resource.delimiter),
      stats,
    });
    stats.archiveEntries = 1;
    return stats;
  }

  const directory = await mkdtemp(join(tmpdir(), 'origination-public-data-'));
  const archivePath = join(directory, input.resource.format === 'zip' ? 'resource.zip' : 'resource.gz');
  try {
    if (!response.body) throw new Error('Archive response did not include a body.');
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(archivePath));
    if (input.resource.format === 'gzip') {
      const child = spawn('gzip', ['-dc', archivePath], { stdio: ['ignore', 'pipe', 'pipe'] });
      await processRows({
        ...input,
        entryName: input.resource.name,
        rows: rowsFromNodeStream(child.stdout, input.resource.encoding, input.resource.delimiter),
        stats,
      });
      stats.archiveEntries = 1;
      return stats;
    }

    const entries = (await commandOutput('unzip', ['-Z1', archivePath]))
      .split(/\r?\n/)
      .filter((entry) => /\.(csv|txt)$/i.test(entry));
    const entryPattern = input.resource.archiveEntryPattern ? new RegExp(input.resource.archiveEntryPattern, 'i') : null;
    const selected = entryPattern ? entries.filter((entry) => entryPattern.test(entry)) : entries;
    for (const entry of selected.length ? selected : entries) {
      if (stats.recordsMatched >= input.maxMatchedRows) break;
      const child = spawn('unzip', ['-p', archivePath, entry], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      await processRows({
        ...input,
        entryName: entry,
        rows: rowsFromNodeStream(child.stdout, input.resource.encoding, input.resource.delimiter),
        stats,
      });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      if (exitCode !== 0) throw new Error(`unzip failed for ${entry}: ${stderr}`);
      stats.archiveEntries += 1;
    }
    return stats;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
