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

export type PublicBulkStreamStats = { rowsScanned: number; recordsMatched: number; archiveEntries: number };

const SOURCE_CODES: Record<PublicBulkDatasetCode, string> = {
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
const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const parseNumber = (value: unknown) => {
  const text = clean(value);
  if (!text) return null;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/[^0-9.-]/g, '');
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
  .map((match) => { try { return new URL(match[1], base).toString(); } catch { return null; } })
  .filter((value): value is string => Boolean(value));
const fetchText = async (url: string) => {
  const response = await fetch(url, { headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' } });
  if (!response.ok) throw new Error(`Discovery failed: ${response.status} ${url}`);
  return response.text();
};

async function probeResource(url: string) {
  const headers = { 'User-Agent': 'OriginationIntelligencePlatform/1.0' };
  let response = await fetch(url, { method: 'HEAD', redirect: 'follow', headers }).catch(() => null);
  if (!response?.ok) {
    response = await fetch(url, { method: 'GET', redirect: 'follow', headers: { ...headers, Range: 'bytes=0-0' } }).catch(() => null);
    await response?.body?.cancel().catch(() => undefined);
  }
  return {
    ok: Boolean(response?.ok),
    modifiedAt: response?.headers.get('last-modified') ?? null,
    etag: response?.headers.get('etag') ?? null,
  };
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10).replaceAll('-', '');
const monthKey = (date: Date) => date.toISOString().slice(0, 7).replace('-', '');
async function discoverPortalArchive(slug: string, reference?: string, monthly = false) {
  const candidates: string[] = [];
  const explicit = reference?.replace(/\D/g, '');
  if (explicit && ((monthly && explicit.length === 6) || (!monthly && explicit.length === 8))) candidates.push(explicit);
  for (let offset = 0; offset < (monthly ? 8 : 20); offset += 1) {
    const date = new Date();
    if (monthly) date.setUTCMonth(date.getUTCMonth() - offset);
    else date.setUTCDate(date.getUTCDate() - offset);
    candidates.push(monthly ? monthKey(date) : dayKey(date));
  }
  for (const candidate of [...new Set(candidates)]) {
    const url = `https://portaldatransparencia.gov.br/download-de-dados/${slug}/${candidate}`;
    const metadata = await probeResource(url);
    if (!metadata.ok) continue;
    return {
      url,
      referenceDate: monthly
        ? `${candidate.slice(0, 4)}-${candidate.slice(4, 6)}-01`
        : `${candidate.slice(0, 4)}-${candidate.slice(4, 6)}-${candidate.slice(6, 8)}`,
      ...metadata,
    };
  }
  throw new Error(`No downloadable Portal da Transparência archive found for ${slug}.`);
}

type BndesCkanResource = Record<string, unknown>;
const isBndesCsv = (resource: BndesCkanResource) => String(resource.format ?? '').toUpperCase() === 'CSV'
  && /operac/i.test(String(resource.name ?? resource.url ?? ''));
const isBndesNonAutomatic = (resource: BndesCkanResource) => /n[aã]o[-_\s]?autom|nao[-_\s]?autom/i
  .test(String(resource.name ?? resource.url ?? ''));
const mapBndesResource = (resource: BndesCkanResource): PublicBulkResource => ({
  key: String(resource.id ?? `bndes:${hash(resource.url).slice(0, 24)}`),
  name: String(resource.name ?? basename(String(resource.url)) ?? 'BNDES CSV'),
  url: String(resource.url),
  format: 'csv',
  encoding: 'windows-1252',
  delimiter: ';',
  referenceDate: parseDate(resource.last_modified) ?? new Date().toISOString().slice(0, 10),
  modifiedAt: clean(resource.last_modified) || null,
  etag: clean(resource.hash) || null,
});

async function discoverBndesResources(maxResources: number): Promise<PublicBulkResource[]> {
  const apiUrl = 'https://dadosabertos.bndes.gov.br/api/3/action/package_show?id=operacoes-financiamento';
  let candidates: BndesCkanResource[] = [];
  try {
    const response = await fetch(apiUrl, { headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' } });
    if (response.ok) {
      const payload = await response.json() as { result?: { resources?: BndesCkanResource[] } };
      candidates = (payload.result?.resources ?? []).filter(isBndesCsv);
    }
  } catch {
    candidates = [];
  }

  if (!candidates.length) {
    const pageUrl = 'https://dadosabertos.bndes.gov.br/dataset/operacoes-financiamento';
    candidates = linksFromHtml(await fetchText(pageUrl), pageUrl)
      .filter((url) => /\/download\/.*\.csv(?:\?|$)/i.test(url))
      .map((url) => ({
        id: `bndes:${hash(url).slice(0, 24)}`,
        name: decodeURIComponent(basename(url)).replace(/[-_]+/g, ' '),
        url,
        format: 'CSV',
      }));
  }

  const ordered = [...candidates].sort((left, right) => Number(isBndesNonAutomatic(right)) - Number(isBndesNonAutomatic(left)));
  const resources = ordered.slice(0, maxResources).map(mapBndesResource);
  if (!resources.length) throw new Error('BNDES returned no financing CSV resources through CKAN or dataset-page fallback.');
  return resources;
}

export async function discoverPublicBulkResources(
  datasetCode: PublicBulkDatasetCode,
  options: { reference?: string; maxResources?: number } = {},
): Promise<PublicBulkResource[]> {
  const maxResources = Math.max(1, Math.min(options.maxResources ?? 20, 100));

  if (datasetCode === 'bndes_financing_operations') return discoverBndesResources(maxResources);

  if (datasetCode === 'pgfn_debt') {
    const pageUrl = 'https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos';
    const links = linksFromHtml(await fetchText(pageUrl), pageUrl)
      .filter((url) => /\.(zip|csv)(\?|$)/i.test(url));
    const reference = options.reference?.replace(/\D/g, '');
    const filtered = reference ? links.filter((url) => url.replace(/\D/g, '').includes(reference)) : links;
    const selected = [...new Set(filtered.length ? filtered : links)].slice(0, maxResources);
    if (!selected.length) throw new Error('PGFN page returned no downloadable CSV/ZIP resources.');
    return selected.map((url, index) => ({
      key: `pgfn:${hash(url).slice(0, 24)}`,
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
    const folders = linksFromHtml(await fetchText(rootUrl), rootUrl)
      .filter((url) => /\/20\d{2}-\d{2}\/$/.test(url))
      .sort().reverse();
    const wanted = options.reference?.replace('/', '-');
    const folder = wanted ? folders.find((url) => url.includes(`${wanted}/`)) : folders[0];
    if (!folder) throw new Error('RFB monthly CNPJ folder was not found.');
    const resources = linksFromHtml(await fetchText(folder), folder)
      .filter((url) => /\.(zip|csv)$/.test(url))
      .filter((url) => /(Empresas|Estabelecimentos)/i.test(url))
      .slice(0, maxResources);
    if (!resources.length) throw new Error('RFB folder returned no Empresas/Estabelecimentos resources.');
    const month = folder.match(/(20\d{2}-\d{2})\/$/)?.[1] ?? wanted ?? '';
    return resources.map((url) => ({
      key: `rfb:${basename(url)}`,
      name: basename(url),
      url,
      format: /\.csv$/i.test(url) ? 'csv' : 'zip',
      encoding: 'latin1',
      delimiter: ';',
      referenceDate: month ? `${month}-01` : null,
      archiveEntryPattern: '(Empresas|Estabelecimentos|EMPRECSV|ESTABELE)',
    }));
  }

  if (datasetCode === 'cgu_ceis' || datasetCode === 'cgu_cnep') {
    const slug = datasetCode === 'cgu_ceis' ? 'ceis' : 'cnep';
    const item = await discoverPortalArchive(slug, options.reference, false);
    return [{
      key: `${slug}:${item.referenceDate}`,
      name: `CGU ${slug.toUpperCase()} ${item.referenceDate}`,
      url: item.url,
      format: 'zip',
      encoding: 'windows-1252',
      delimiter: ';',
      referenceDate: item.referenceDate,
      modifiedAt: item.modifiedAt,
      etag: item.etag,
      archiveEntryPattern: slug,
    }];
  }

  const item = await discoverPortalArchive('compras', options.reference, true);
  return [{
    key: `compras-contracts:${item.referenceDate}`,
    name: `Contratos públicos ${item.referenceDate}`,
    url: item.url,
    format: 'zip',
    encoding: 'windows-1252',
    delimiter: ';',
    referenceDate: item.referenceDate,
    modifiedAt: item.modifiedAt,
    etag: item.etag,
    archiveEntryPattern: '(?:^|[/_])Compras(?:[._]|$)',
  }];
}

export async function* parseDelimitedText(chunks: AsyncIterable<string>, delimiter: string): AsyncGenerator<string[]> {
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quotePending = false;
  for await (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index];
      if (quoted) {
        if (quotePending) {
          if (char === '"') { field += '"'; quotePending = false; continue; }
          quoted = false;
          quotePending = false;
        }
        if (quoted) {
          if (char === '"') quotePending = true;
          else field += char;
          continue;
        }
      }
      if (char === '"' && field.length === 0) quoted = true;
      else if (char === delimiter) { row.push(field); field = ''; }
      else if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        if (row.some(Boolean)) yield row;
        row = [];
        field = '';
      } else if (char !== '\r') field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    if (row.some(Boolean)) yield row;
  }
}

async function* decodeWeb(response: Response, encoding: string) {
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
async function* decodeNode(stream: NodeJS.ReadableStream, encoding: string) {
  const decoder = new TextDecoder(encoding);
  for await (const chunk of stream as AsyncIterable<Buffer>) yield decoder.decode(chunk, { stream: true });
  const tail = decoder.decode();
  if (tail) yield tail;
}
const commandOutput = (command: string, args: string[]) => new Promise<string>((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => { out += chunk.toString(); });
  child.stderr.on('data', (chunk) => { err += chunk.toString(); });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(`${command} exited ${code}: ${err}`)));
});
const nodeRows = (stream: NodeJS.ReadableStream, encoding: string, delimiter: string) => parseDelimitedText(decodeNode(stream, encoding), delimiter);
const rowObject = (headers: string[], values: string[]) => Object.fromEntries(headers.map((header, index) => [normalizeHeader(header), clean(values[index] ?? '')]));
const rfbHeaders = (name: string) => /(Estabelecimentos|ESTABELE)/i.test(name) ? RFB_ESTABLISHMENT_HEADERS : RFB_COMPANY_HEADERS;
const targetMatch = (cnpj: string, targets: Set<string>, roots: Set<string>) => cnpj.length === 14
  ? targets.has(cnpj) || roots.has(cnpj.slice(0, 8))
  : roots.has(cnpj.slice(0, 8));

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
    entityCnpj = digits(pick(row, ['cpf_cnpj', 'cpf/cnpj', 'cnpj', 'cnpj_do_cliente']));
    if (entityCnpj.length !== 14 || !targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;
    entityName = pick(row, ['cliente']);
    recordType = 'bndes_financing';
    referenceDate = parseDate(pick(row, ['data_da_contratacao', 'data da contratacao'])) ?? referenceDate;
    amount = parseNumber(pick(row, ['valor_da_operacao_em_reais', 'valor da operacao em reais', 'valor_contratado_reais']));
    status = pick(row, ['situacao_da_operacao', 'situacao da operacao', 'situacao_do_contrato']);
    normalizedPayload = {
      summary: `${entityName} · operação BNDES${amount !== null ? ` · R$ ${amount.toFixed(2)}` : ''}`,
      contractNumber: pick(row, ['numero_do_contrato', 'numero do contrato']),
      projectDescription: pick(row, ['descricao_do_projeto', 'descricao do projeto']),
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
    identity = {
      entityCnpj,
      referenceDate,
      amount,
      contractNumber: normalizedPayload.contractNumber,
      product: normalizedPayload.product,
      instrument: normalizedPayload.instrument,
    };
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
    entityCnpj = digits(pick(row, [
      'codigo_contratado',
      'cnpj_contratado',
      'cpf_cnpj_fornecedor',
      'cpf/cnpj fornecedor',
      'documento fornecedor',
    ]));
    if (entityCnpj.length !== 14 || !targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;
    entityName = pick(row, ['nome_contratado', 'nome_fornecedor', 'razao_social_fornecedor']);
    recordType = 'public_contract';
    referenceDate = parseDate(pick(row, [
      'data_assinatura_contrato',
      'data_assinatura',
      'data assinatura',
      'data_inicio_da_vigencia',
      'data_inicio_vigencia',
    ])) ?? referenceDate;
    amount = parseNumber(pick(row, [
      'valor_final_da_compra',
      'valor_inicial_da_compra',
      'valor_global',
      'valor contrato',
      'valor_contrato',
    ]));
    status = pick(row, ['situacao_contrato', 'situacao', 'status_contrato']);
    const contractNumber = pick(row, ['numero_do_contrato', 'numero_contrato', 'contrato']);
    normalizedPayload = {
      summary: `${entityName || entityCnpj} · contrato público ${contractNumber}${amount !== null ? ` · R$ ${amount.toFixed(2)}` : ''}`,
      contractNumber,
      object: pick(row, ['objeto', 'objeto_contrato']),
      contractingBody: pick(row, [
        'nome_orgao_superior',
        'nome_orgao',
        'nome_ug',
        'orgao_superior',
        'orgao_contratante',
        'unidade_gestora',
      ]),
      endDate: parseDate(pick(row, ['data_fim_da_vigencia', 'data_fim_vigencia', 'data final vigencia'])),
      initialAmount: parseNumber(pick(row, ['valor_inicial_da_compra'])),
      finalAmount: parseNumber(pick(row, ['valor_final_da_compra'])),
    };
    identity = { entityCnpj, contractNumber, referenceDate, amount };
  } else {
    const root = digits(row.cnpj_basico).padStart(8, '0');
    const establishment = Boolean(row.cnpj_ordem || row.cnpj_dv);
    entityCnpj = establishment ? `${root}${digits(row.cnpj_ordem).padStart(4, '0')}${digits(row.cnpj_dv).padStart(2, '0')}` : root;
    if (!targetMatch(entityCnpj, targetCnpjs, targetRoots)) return null;
    entityName = clean(establishment ? row.nome_fantasia : row.razao_social);
    recordType = establishment ? 'rfb_establishment_snapshot' : 'rfb_company_snapshot';
    status = establishment ? clean(row.situacao_cadastral) : '';
    amount = establishment ? null : parseNumber(row.capital_social);
    normalizedPayload = establishment ? {
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

  const recordKey = hash({ datasetCode, resource: resource.key, ...identity });
  const contentHash = hash({ row, normalizedPayload });
  return {
    datasetCode,
    sourceCode: SOURCE_CODES[datasetCode],
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
    rawPayload: row,
    normalizedPayload,
  };
}

async function consumeRows(input: {
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
    if (!headers) { headers = values.map(normalizeHeader); continue; }
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
  const stats = { rowsScanned: 0, recordsMatched: 0, archiveEntries: 0 };
  const response = await fetch(input.resource.url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' },
  });
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${input.resource.url}`);

  if (input.resource.format === 'csv') {
    await consumeRows({
      ...input,
      entryName: input.resource.name,
      rows: parseDelimitedText(decodeWeb(response, input.resource.encoding), input.resource.delimiter),
      stats,
    });
    stats.archiveEntries = 1;
    return stats;
  }

  const directory = await mkdtemp(join(tmpdir(), 'origination-public-data-'));
  const archive = join(directory, input.resource.format === 'zip' ? 'resource.zip' : 'resource.gz');
  try {
    if (!response.body) throw new Error('Archive response did not include a body.');
    await pipeline(Readable.fromWeb(response.body as any), createWriteStream(archive));
    if (input.resource.format === 'gzip') {
      const child = spawn('gzip', ['-dc', archive], { stdio: ['ignore', 'pipe', 'pipe'] });
      await consumeRows({ ...input, entryName: input.resource.name, rows: nodeRows(child.stdout, input.resource.encoding, input.resource.delimiter), stats });
      stats.archiveEntries = 1;
      return stats;
    }

    const allEntries = (await commandOutput('unzip', ['-Z1', archive])).split(/\r?\n/).filter(Boolean);
    const pattern = input.resource.archiveEntryPattern ? new RegExp(input.resource.archiveEntryPattern, 'i') : null;
    const entries = allEntries.filter((entry) => {
      if (input.datasetCode === 'rfb_cnpj') return /(Empresas|Estabelecimentos|EMPRECSV|ESTABELE)/i.test(entry);
      return /\.(csv|txt)$/i.test(entry) && (!pattern || pattern.test(entry));
    });
    if (!entries.length) throw new Error(`Archive contains no compatible data entries: ${input.resource.name}`);

    for (const entry of entries) {
      if (stats.recordsMatched >= input.maxMatchedRows) break;
      const child = spawn('unzip', ['-p', archive, entry], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      await consumeRows({ ...input, entryName: entry, rows: nodeRows(child.stdout, input.resource.encoding, input.resource.delimiter), stats });
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
