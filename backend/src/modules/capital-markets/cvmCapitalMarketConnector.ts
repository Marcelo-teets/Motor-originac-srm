import { createHash } from 'node:crypto';
import {
  CVM_DATASETS,
  discoverCvmResources,
  normalizeKey,
  selectDatasetResources,
  type CsvRecord,
  type CvmDatasetCode,
  type CvmDatasetDefinition,
  type CvmResource,
  type NormalizedCapitalMarketRecord,
} from './cvmDatasetRegistry.js';
import { decodeBuffer, extractZipEntries, parseCsv } from './cvmFileParser.js';

export {
  CVM_DATASETS,
  discoverCvmResources,
  selectDatasetResources,
  extractZipEntries,
  parseCsv,
};
export type { CvmDatasetCode, CvmResource, NormalizedCapitalMarketRecord };

const digitsOnly = (value: string | null | undefined) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
};

const stableHash = (value: string) => createHash('sha256').update(value).digest('hex');

const rowAccessor = (row: CsvRecord) => {
  const entries = Object.entries(row).map(([key, value]) => ({ key: normalizeKey(key), value }));
  const indexed = new Map(entries.map(({ key, value }) => [key, value]));
  const pick = (...aliases: string[]) => {
    for (const alias of aliases) {
      const value = indexed.get(normalizeKey(alias));
      if (value?.trim()) return value.trim();
    }
    return null;
  };
  pick.matching = (...patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = entries.find(({ key, value }) => value?.trim() && pattern.test(key));
      if (match) return match.value.trim();
    }
    return null;
  };
  return pick;
};

const parseDate = (value: string | null) => {
  if (!value) return null;
  const clean = value.trim();
  const iso = clean.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const br = clean.match(/^([0-3]?\d)[-/]([01]?\d)[-/](\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const month = clean.match(/^(\d{4})[-/]([01]?\d)$/);
  if (month) return `${month[1]}-${month[2].padStart(2, '0')}-01`;
  return null;
};

const parseNumber = (value: string | null) => {
  if (!value) return null;
  let clean = value.replace(/\s/g, '').replace(/R\$/gi, '').replace(/%/g, '');
  if (!clean || clean === '-') return null;
  if (clean.includes(',') && clean.includes('.')) clean = clean.replace(/\./g, '').replace(',', '.');
  else if (clean.includes(',')) clean = clean.replace(',', '.');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};

const inferInstrument = (definition: CvmDatasetDefinition, pick: ReturnType<typeof rowAccessor>) => {
  const explicit = pick('Valor Mobiliario', 'Tipo Valor Mobiliario', 'Tipo Ativo', 'Tipo Fundo', 'Classe Ativo', 'Categoria');
  const text = `${explicit ?? ''} ${definition.instrumentFallback}`.toUpperCase();
  const canonical = normalizeKey(text);
  if (canonical.includes('debent')) return 'DEBENTURE';
  if (/(^|[^a-z])cri([^a-z]|$)/i.test(text)) return 'CRI';
  if (/(^|[^a-z])cra([^a-z]|$)/i.test(text)) return 'CRA';
  if (canonical.includes('fidc') || canonical.includes('direitoscreditorios')) return 'FIDC';
  if (canonical.includes('fii') || canonical.includes('imobiliario')) return 'FII';
  return explicit?.toUpperCase() ?? definition.instrumentFallback;
};

export const normalizeCapitalMarketRecord = (input: {
  datasetCode: CvmDatasetCode;
  row: CsvRecord;
  resource: CvmResource;
  fileName: string;
  observedAt: string;
}): NormalizedCapitalMarketRecord => {
  const definition = CVM_DATASETS[input.datasetCode];
  const pick = rowAccessor(input.row);
  const issuerCnpj = digitsOnly(pick(
    'CNPJ Emissor', 'CNPJ do Emissor', 'CNPJ Emissor Ofertante', 'CNPJ Ofertante', 'CNPJ Companhia',
    'CNPJ Securitizadora', 'CNPJ Cia Securitizadora', 'CNPJ Cia', 'CNPJ Devedor', 'CNPJ Cedente',
  ) ?? pick.matching(/cnpj.*(emissor|ofertante|companhia|cia|securitizadora|devedor|cedente)/));
  const fundCnpj = digitsOnly(pick(
    'CNPJ Fundo', 'CNPJ do Fundo', 'CNPJ Classe', 'CNPJ Fundo Classe', 'CNPJ Fundo Cota', 'CNPJ FIDC', 'CNPJ FII',
  ) ?? pick.matching(/cnpj.*(fundo|classe|fidc|fii)/));
  const referenceDate = parseDate(pick(
    'Data Referencia', 'Data de Referencia', 'DT Refer', 'DT Referencia', 'DT Competencia', 'DT COMPTC',
    'Competencia', 'Mes Competencia', 'Data Competencia',
  ) ?? pick.matching(/(dt|data).*(refer|comptc|competencia)/));
  const eventDate = parseDate(pick(
    'Data Registro Oferta', 'Data Registro', 'DT Registro', 'Data Inicio Oferta', 'Data Inicio', 'DT Inicio',
    'Data Emissao', 'DT Emissao', 'Data Constituicao', 'Data Funcionamento', 'Data Oferta',
  ) ?? pick.matching(/(dt|data).*(registro|inicio|emissao|constituicao|funcionamento|oferta)/));
  const maturityDate = parseDate(pick('Data Vencimento', 'DT Vencimento', 'Vencimento', 'Data Final', 'DT Final'));
  const instrumentType = inferInstrument(definition, pick);
  const issuerName = pick(
    'Nome Emissor', 'Razao Social Emissor', 'Emissor', 'Nome Companhia', 'Nome Cia', 'Nome Securitizadora',
    'Denom Cia', 'Devedor', 'Cedente',
  ) ?? pick.matching(/(nome|denom|razaosocial).*(emissor|companhia|cia|securitizadora|devedor|cedente)/);
  const fundName = pick('Denominacao Social', 'DENOM SOCIAL', 'Nome Fundo', 'Denominacao Fundo', 'Nome Classe')
    ?? pick.matching(/(nome|denom|razaosocial).*(fundo|classe|fidc|fii)/);
  const offerId = pick(
    'Numero Registro Oferta', 'NR Registro Oferta', 'Numero Processo', 'NR Processo', 'Codigo Oferta', 'ID Oferta', 'Numero Oferta',
  ) ?? pick.matching(/(numero|nr|codigo|id).*(registrooferta|oferta|processo)/);
  const securityCode = pick('Codigo Ativo', 'Codigo Cetip', 'Codigo ISIN', 'ISIN', 'Codigo Negociacao', 'Codigo CVM');
  const series = pick('Serie', 'Numero Serie', 'NR Serie', 'Classe Serie', 'Subclasse', 'Numero Emissao', 'NR Emissao');
  const status = pick('Situacao Oferta', 'Status Oferta', 'Situacao', 'Status', 'Situacao Fundo', 'Situacao Classe');
  const volume = parseNumber(pick(
    'Valor Total', 'Valor Total Oferta', 'VL Total Oferta', 'Valor Oferta', 'VL Oferta', 'Montante Oferta', 'Volume Total',
    'Patrimonio Liquido', 'VL Patrimonio Liquido', 'PL', 'Valor Emissao', 'VL Emissao',
    'Saldo Devedor', 'VL Saldo Devedor', 'Valor Captado', 'VL Captado',
  ) ?? pick.matching(/(valor|vl|montante|volume).*(totaloferta|oferta|patrimonioliquido|emissao|saldodevedor|captado)/, /(^|.*)vlpl$/));
  const contentHash = stableHash(JSON.stringify(input.row));
  const normalizedIssuer = normalizeKey(issuerName ?? fundName ?? '');
  const naturalIdentity = [
    offerId,
    securityCode,
    issuerCnpj ?? fundCnpj ?? normalizedIssuer,
    series,
    referenceDate ?? eventDate,
    instrumentType,
  ].filter(Boolean).join('|');
  const recordKey = stableHash([
    input.datasetCode,
    naturalIdentity || `${input.resource.name}|${input.fileName}|${contentHash}`,
  ].join('|'));
  const entityCnpj = issuerCnpj ?? fundCnpj;

  const normalizedPayload = {
    sourceCode: definition.sourceCode,
    packageId: definition.packageId,
    resourceId: input.resource.id ?? null,
    resourceModifiedAt: input.resource.last_modified ?? null,
    fileName: input.fileName,
    issuerCnpj,
    issuerName,
    fundCnpj,
    fundName,
    instrumentType,
    offerId,
    securityCode,
    series,
    status,
    referenceDate,
    eventDate,
    maturityDate,
    volume,
  };

  return {
    bronze: {
      dataset_code: input.datasetCode,
      record_key: recordKey,
      ref_date: referenceDate ?? eventDate,
      entity_cnpj: entityCnpj,
      payload: {
        sourceCode: definition.sourceCode,
        resourceName: input.resource.name,
        fileName: input.fileName,
        observedAt: input.observedAt,
        row: input.row,
        normalized: normalizedPayload,
      },
      source_url: input.resource.url,
      content_hash: contentHash,
    },
    event: {
      dataset_code: input.datasetCode,
      source_code: definition.sourceCode,
      record_key: recordKey,
      content_hash: contentHash,
      event_type: definition.eventType,
      instrument_type: instrumentType,
      issuer_cnpj: issuerCnpj,
      issuer_name: issuerName,
      fund_cnpj: fundCnpj,
      fund_name: fundName,
      security_code: securityCode,
      offer_id: offerId,
      series,
      status,
      reference_date: referenceDate,
      event_date: eventDate,
      maturity_date: maturityDate,
      volume,
      currency: 'BRL',
      source_url: input.resource.url,
      source_resource_name: input.resource.name,
      source_file_name: input.fileName,
      raw_payload: input.row,
      normalized_payload: normalizedPayload,
      observed_at: input.observedAt,
      updated_at: input.observedAt,
    },
  };
};

export const fetchCvmResourceRecords = async (input: {
  datasetCode: CvmDatasetCode;
  resource: CvmResource;
  maxRows: number;
  observedAt?: string;
}): Promise<NormalizedCapitalMarketRecord[]> => {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const response = await fetch(input.resource.url, {
    headers: {
      accept: 'application/zip,text/csv,text/plain,*/*',
      'user-agent': 'Motor-Origination/1.0',
    },
  });
  if (!response.ok) throw new Error(`CVM resource failed: ${response.status} ${input.resource.url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  const isZip = /zip/i.test(contentType) || /\.zip(?:$|\?)/i.test(input.resource.url) || (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50);
  const files = isZip
    ? extractZipEntries(buffer).filter((entry) => /\.csv$/i.test(entry.name))
    : [{ name: input.resource.name || 'resource.csv', data: buffer }];
  if (!files.length) throw new Error(`No CSV file found in ${input.resource.name}.`);

  const records: NormalizedCapitalMarketRecord[] = [];
  for (const file of files) {
    const rows = parseCsv(decodeBuffer(file.data));
    for (const row of rows) {
      records.push(normalizeCapitalMarketRecord({
        datasetCode: input.datasetCode,
        row,
        resource: input.resource,
        fileName: file.name,
        observedAt,
      }));
      if (records.length >= input.maxRows) return records;
    }
  }
  return records;
};
