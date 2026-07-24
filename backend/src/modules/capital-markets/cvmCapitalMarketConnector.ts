import { createHash } from 'node:crypto';
import {
  CVM_DATASETS,
  discoverCvmResources,
  normalizeKey,
  selectDatasetResources,
  type CapitalMarketEntityRole,
  type CsvRecord,
  type CvmDatasetCode,
  type CvmDatasetDefinition,
  type CvmResource,
  type NormalizedCapitalMarketEntityLink,
  type NormalizedCapitalMarketMetric,
  type NormalizedCapitalMarketRecord,
} from './cvmDatasetRegistry.js';
import { decodeBuffer, extractZipEntries, parseCsv } from './cvmFileParser.js';
import { fetchCvmWithRetry } from './cvmHttp.js';

export {
  CVM_DATASETS,
  discoverCvmResources,
  selectDatasetResources,
  extractZipEntries,
  parseCsv,
};
export type { CvmDatasetCode, CvmResource, NormalizedCapitalMarketRecord };

const TARGET_OFFER_INSTRUMENTS = new Set([
  'DEBENTURE',
  'NOTA_COMERCIAL',
  'CRI',
  'CRA',
  'FIDC',
  'FII',
  'FIAGRO',
]);

const digitsOnly = (value: string | null | undefined) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
};

const stableHash = (value: string) => createHash('sha256').update(value).digest('hex');

const rowAccessor = (row: CsvRecord) => {
  const entries = Object.entries(row).map(([key, value]) => ({
    originalKey: key,
    key: normalizeKey(key),
    value,
  }));
  const indexed = new Map(entries.map((entry) => [entry.key, entry]));
  const pick = (...aliases: string[]) => {
    for (const alias of aliases) {
      const entry = indexed.get(normalizeKey(alias));
      if (entry?.value?.trim()) return entry.value.trim();
    }
    return null;
  };
  pick.withColumn = (...aliases: string[]) => {
    for (const alias of aliases) {
      const entry = indexed.get(normalizeKey(alias));
      if (entry?.value?.trim()) return { value: entry.value.trim(), column: entry.originalKey };
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

type RowPick = ReturnType<typeof rowAccessor>;

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

const eventDateFromPick = (pick: RowPick) => parseDate(pick(
  'Data Registro Oferta', 'Data Registro', 'DT Registro', 'Data Inicio Oferta', 'Data Inicio', 'DT Inicio',
  'Data Emissao', 'DT Emissao', 'Data Abertura Processo', 'Data Constituicao', 'Data Funcionamento', 'Data Oferta',
  'Data Entrega', 'DT Entrega', 'Data Recebimento', 'DT Receb', 'DT RECEB',
) ?? pick.matching(/(dt|data).*(registrooferta|registro|iniciooferta|inicio|emissao|aberturaprocesso|constituicao|funcionamento|oferta|entrega|receb)/));

const parseNumber = (value: string | null) => {
  if (!value) return null;
  let clean = value.replace(/\s/g, '').replace(/R\$/gi, '').replace(/%/g, '');
  if (!clean || clean === '-') return null;
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    clean = lastComma > lastDot
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean.replace(/,/g, '');
  } else if (lastComma >= 0) {
    clean = clean.replace(',', '.');
  }
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
};

const inferInstrument = (definition: CvmDatasetDefinition, pick: RowPick) => {
  const explicit = pick(
    'Valor Mobiliario', 'Tipo Valor Mobiliario', 'Tipo Ativo', 'Tipo Fundo', 'Classe Ativo', 'Categoria',
    'Tipo Produto', 'Tipo Certificado', 'TP Fundo', 'TP_FUNDO',
  );
  const text = `${explicit ?? ''} ${definition.instrumentFallback}`.toUpperCase();
  const canonical = normalizeKey(text);
  if (canonical.includes('notacomercial')) return 'NOTA_COMERCIAL';
  if (canonical.includes('debent')) return 'DEBENTURE';
  if (canonical.includes('recebiveisdoagronegocio') || canonical.includes('recebiveisagronegocio')) return 'CRA';
  if (canonical.includes('recebiveisimobiliario')) return 'CRI';
  if (/(^|[^a-z])cri([^a-z]|$)/i.test(text)) return 'CRI';
  if (/(^|[^a-z])cra([^a-z]|$)/i.test(text)) return 'CRA';
  if (canonical.includes('fiagro')) return 'FIAGRO';
  if (canonical.includes('fidc') || canonical.includes('direitoscreditorios')) return 'FIDC';
  if (canonical.includes('fii') || canonical.includes('fundodeinvestimentoimobiliario')) return 'FII';
  if (definition.code === 'cvm_securitization_ots') return 'OUTRO_TITULO_SECURITIZACAO';
  return explicit?.toUpperCase() ?? definition.instrumentFallback;
};

const offerRowRecency = (row: CsvRecord) => {
  const pick = rowAccessor(row);
  const date = eventDateFromPick(pick)
    ?? parseDate(pick('Data Encerramento Oferta', 'Ultimo Comunicado', 'Data Comunicado'));
  return date ? Date.parse(`${date}T00:00:00Z`) : 0;
};

export const prioritizeCvmRows = (datasetCode: CvmDatasetCode, rows: CsvRecord[]) => {
  if (datasetCode !== 'cvm_offers') return rows;
  return [...rows].sort((left, right) => offerRowRecency(right) - offerRowRecency(left));
};

const addEntity = (input: {
  links: Array<Omit<NormalizedCapitalMarketEntityLink, 'dataset_code' | 'record_key' | 'content_hash' | 'observed_at' | 'updated_at'>>;
  role: CapitalMarketEntityRole;
  cnpj: string | null;
  name: string | null;
  primary: boolean;
  sourceFields: string[];
}) => {
  const name = input.name?.trim() || null;
  if (!input.cnpj && !name) return;
  const entityKey = input.cnpj ?? stableHash(normalizeKey(name ?? ''));
  const duplicate = input.links.some((link) => link.entity_role === input.role && link.entity_key === entityKey);
  if (duplicate) return;
  input.links.push({
    entity_key: entityKey,
    entity_role: input.role,
    entity_cnpj: input.cnpj,
    entity_name: name,
    is_primary_origination_target: input.primary,
    resolution_confidence: input.cnpj ? 1 : 0.65,
    source_fields: input.sourceFields,
  });
};

const extractEntityLinks = (input: {
  pick: RowPick;
  instrumentType: string;
}) => {
  const links: Array<Omit<NormalizedCapitalMarketEntityLink, 'dataset_code' | 'record_key' | 'content_hash' | 'observed_at' | 'updated_at'>> = [];
  const corporateIssuer = !new Set(['CRI', 'CRA', 'FIDC', 'FII', 'FIAGRO', 'FUNDO', 'OUTRO_TITULO_SECURITIZACAO'])
    .has(input.instrumentType);

  addEntity({
    links,
    role: 'issuer',
    cnpj: digitsOnly(input.pick('CNPJ Emissor', 'CNPJ do Emissor', 'CNPJ Emissor Ofertante', 'CNPJ Ofertante', 'CNPJ Companhia', 'CNPJ Cia', 'CNPJ_CIA')),
    name: input.pick('Nome Emissor', 'Razao Social Emissor', 'Emissor', 'Nome Ofertante', 'Nome Vendedor', 'Nome Companhia', 'Nome Cia', 'Denom Cia', 'DENOM_CIA', 'DENOM_SOCIAL'),
    primary: corporateIssuer,
    sourceFields: ['issuer'],
  });
  addEntity({
    links,
    role: 'securitizer',
    cnpj: digitsOnly(input.pick('CNPJ Securitizadora', 'CNPJ Cia Securitizadora', 'CNPJ da Securitizadora')),
    name: input.pick('Nome Securitizadora', 'Razao Social Securitizadora', 'Denominacao Securitizadora'),
    primary: false,
    sourceFields: ['securitizer'],
  });
  addEntity({
    links,
    role: 'debtor',
    cnpj: digitsOnly(input.pick('CNPJ Devedor', 'CNPJ do Devedor', 'CNPJ Devedora')),
    name: input.pick('Devedor', 'Nome Devedor', 'Razao Social Devedor'),
    primary: true,
    sourceFields: ['debtor'],
  });
  addEntity({
    links,
    role: 'originator',
    cnpj: digitsOnly(input.pick('CNPJ Originador', 'CNPJ do Originador', 'CNPJ Originadora')),
    name: input.pick('Originador', 'Nome Originador', 'Razao Social Originador'),
    primary: true,
    sourceFields: ['originator'],
  });
  addEntity({
    links,
    role: 'assignor',
    cnpj: digitsOnly(input.pick('CNPJ Cedente', 'CNPJ do Cedente', 'CNPJ Cedente Originador')),
    name: input.pick('Cedente', 'Nome Cedente', 'Razao Social Cedente'),
    primary: true,
    sourceFields: ['assignor'],
  });
  addEntity({
    links,
    role: 'fund',
    cnpj: digitsOnly(input.pick('CNPJ Fundo', 'CNPJ do Fundo', 'CNPJ Classe', 'CNPJ Fundo Classe', 'CNPJ Fundo Cota', 'CNPJ FIDC', 'CNPJ FII', 'CNPJ_FUNDO')),
    name: input.pick('Denominacao Social', 'DENOM SOCIAL', 'Nome Fundo', 'Denominacao Fundo', 'Nome Classe', 'DENOM_SOCIAL'),
    primary: false,
    sourceFields: ['fund'],
  });
  addEntity({
    links,
    role: 'administrator',
    cnpj: digitsOnly(input.pick('CNPJ Administrador', 'CNPJ do Administrador', 'CNPJ Adm')),
    name: input.pick('Administrador', 'Nome Administrador', 'Razao Social Administrador'),
    primary: false,
    sourceFields: ['administrator'],
  });
  addEntity({
    links,
    role: 'manager',
    cnpj: digitsOnly(input.pick('CNPJ Gestor', 'CNPJ do Gestor')),
    name: input.pick('Gestor', 'Nome Gestor', 'Razao Social Gestor'),
    primary: false,
    sourceFields: ['manager'],
  });
  addEntity({
    links,
    role: 'custodian',
    cnpj: digitsOnly(input.pick('CNPJ Custodiante', 'CNPJ do Custodiante')),
    name: input.pick('Custodiante', 'Nome Custodiante', 'Razao Social Custodiante'),
    primary: false,
    sourceFields: ['custodian'],
  });
  addEntity({
    links,
    role: 'coordinator',
    cnpj: digitsOnly(input.pick('CNPJ Coordenador Lider', 'CNPJ Coordenador', 'CNPJ do Coordenador')),
    name: input.pick('Coordenador Lider', 'Coordenador', 'Nome Coordenador'),
    primary: false,
    sourceFields: ['coordinator'],
  });
  addEntity({
    links,
    role: 'fiduciary_agent',
    cnpj: digitsOnly(input.pick('CNPJ Agente Fiduciario', 'CNPJ do Agente Fiduciario')),
    name: input.pick('Agente Fiduciario', 'Nome Agente Fiduciario'),
    primary: false,
    sourceFields: ['fiduciary_agent'],
  });
  addEntity({
    links,
    role: 'auditor',
    cnpj: digitsOnly(input.pick('CNPJ Auditor', 'CNPJ do Auditor', 'CNPJ Auditor Independente')),
    name: input.pick('Auditor', 'Nome Auditor', 'Auditor Independente'),
    primary: false,
    sourceFields: ['auditor'],
  });

  return links;
};

const metricDefinitions: Array<{
  code: string;
  label: string;
  unit: NormalizedCapitalMarketMetric['metric_unit'];
  aliases: string[];
}> = [
  { code: 'offer_amount', label: 'Valor total da oferta', unit: 'BRL', aliases: ['Valor Total Oferta', 'VL Total Oferta', 'Valor Oferta', 'VL Oferta', 'Montante Oferta', 'Volume Total', 'Valor Total'] },
  { code: 'issue_amount', label: 'Valor da emissão', unit: 'BRL', aliases: ['Valor Emissao', 'VL Emissao'] },
  { code: 'captured_amount', label: 'Valor captado', unit: 'BRL', aliases: ['Valor Captado', 'VL Captado'] },
  { code: 'outstanding_balance', label: 'Saldo devedor', unit: 'BRL', aliases: ['Saldo Devedor', 'VL Saldo Devedor', 'VL_SALDO_DEVEDOR'] },
  { code: 'fund_nav', label: 'Patrimônio líquido', unit: 'BRL', aliases: ['Patrimonio Liquido', 'VL Patrimonio Liquido', 'VL_PATRIM_LIQ', 'VL_PL', 'PL'] },
  { code: 'receivables_balance', label: 'Direitos creditórios', unit: 'BRL', aliases: ['Direitos Creditorios', 'Valor Direitos Creditorios', 'VL Direitos Creditorios', 'VL_DIR_CRED', 'Carteira Direitos Creditorios'] },
  { code: 'delinquent_balance', label: 'Saldo inadimplente', unit: 'BRL', aliases: ['Saldo Inadimplente', 'Valor Inadimplencia', 'VL Inadimplencia', 'VL_INADIMPL', 'Direitos Creditorios Vencidos'] },
  { code: 'provision_balance', label: 'Provisões', unit: 'BRL', aliases: ['Provisao', 'Valor Provisao', 'VL Provisao', 'VL_PROVISAO', 'PDD', 'VL_PDD'] },
  { code: 'subordinated_nav', label: 'Patrimônio subordinado', unit: 'BRL', aliases: ['Patrimonio Subordinado', 'VL Patrimonio Subordinado', 'VL_COTA_SUBORDINADA', 'Valor Cotas Subordinadas'] },
  { code: 'delinquency_ratio', label: 'Índice de inadimplência', unit: 'PERCENT', aliases: ['Taxa Inadimplencia', 'Percentual Inadimplencia', 'PERC_INADIMPL', 'TX_INADIMPLENCIA'] },
  { code: 'subordination_ratio', label: 'Índice de subordinação', unit: 'PERCENT', aliases: ['Percentual Subordinacao', 'PERC_SUBORDINACAO', 'Indice Subordinacao'] },
];

const extractMetrics = (input: {
  datasetCode: CvmDatasetCode;
  recordKey: string;
  contentHash: string;
  pick: RowPick;
  row: CsvRecord;
  fileName: string;
  referenceDate: string | null;
  observedAt: string;
}) => {
  const metrics: NormalizedCapitalMarketMetric[] = [];
  const scope = input.pick('Grupo DFP', 'GRUPO_DFP', 'Ordem Exercicio', 'ORDEM_EXERC', 'Tipo Classe', 'Categoria', 'Tipo Documento', 'TP_DOC') ?? input.fileName;
  const usedColumns = new Set<string>();

  for (const definition of metricDefinitions) {
    const match = input.pick.withColumn(...definition.aliases);
    const metricValue = parseNumber(match?.value ?? null);
    if (!match || metricValue === null || usedColumns.has(match.column)) continue;
    usedColumns.add(match.column);
    metrics.push({
      dataset_code: input.datasetCode,
      record_key: input.recordKey,
      content_hash: input.contentHash,
      metric_code: definition.code,
      metric_label: definition.label,
      metric_value: metricValue,
      metric_unit: definition.unit,
      reference_date: input.referenceDate,
      measurement_scope: scope,
      source_column: match.column,
      observed_at: input.observedAt,
      updated_at: input.observedAt,
    });
  }

  const account = input.pick.withColumn('VL CONTA', 'VL_CONTA');
  const accountValue = parseNumber(account?.value ?? null);
  const accountCode = input.pick('CD CONTA', 'CD_CONTA', 'Codigo Conta');
  if (account && accountValue !== null && accountCode) {
    const canonicalAccounts: Record<string, string> = {
      '1': 'total_assets',
      '1.01': 'current_assets',
      '1.01.01': 'cash_and_equivalents',
      '1.01.03': 'trade_receivables',
      '1.02': 'non_current_assets',
      '2': 'total_liabilities_and_equity',
      '2.01': 'current_liabilities',
      '2.01.04': 'short_term_debt',
      '2.02': 'non_current_liabilities',
      '2.02.01': 'long_term_debt',
      '2.03': 'equity',
      '3.01': 'net_revenue',
      '3.05': 'operating_result',
      '3.08': 'finance_result',
      '3.11': 'net_income',
      '6.01': 'operating_cash_flow',
      '6.02': 'investing_cash_flow',
      '6.03': 'financing_cash_flow',
      '6.05': 'cash_change',
    };
    metrics.push({
      dataset_code: input.datasetCode,
      record_key: input.recordKey,
      content_hash: input.contentHash,
      metric_code: canonicalAccounts[accountCode] ?? `financial_account_${normalizeKey(accountCode)}`,
      metric_label: input.pick('DS CONTA', 'DS_CONTA', 'Descricao Conta'),
      metric_value: accountValue,
      metric_unit: 'BRL',
      reference_date: input.referenceDate,
      measurement_scope: scope,
      source_column: account.column,
      observed_at: input.observedAt,
      updated_at: input.observedAt,
    });
  }

  return metrics;
};

const dimensionHash = (row: CsvRecord) => {
  const stableEntries = Object.entries(row)
    .map(([key, value]) => [normalizeKey(key), value.trim()] as const)
    .filter(([key, value]) => value && !/^(vl|valor|saldo|qtd|quantidade|taxa|tx|perc|percent|data|dt|status|situacao|versao|nrversao)/.test(key))
    .sort(([left], [right]) => left.localeCompare(right));
  return stableHash(JSON.stringify(stableEntries));
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
  const referenceDate = parseDate(pick(
    'Data Referencia', 'Data de Referencia', 'DT Refer', 'DT Referencia', 'DT Competencia', 'DT COMPTC',
    'Competencia', 'Mes Competencia', 'Data Competencia', 'DT_REFER', 'DT FIM EXERC', 'DT_FIM_EXERC',
  ) ?? pick.matching(/(dt|data).*(refer|comptc|competencia)/));
  const eventDate = eventDateFromPick(pick);
  const maturityDate = parseDate(pick('Data Vencimento', 'DT Vencimento', 'Vencimento', 'Data Final', 'DT Final'));
  const instrumentType = inferInstrument(definition, pick);
  const rawLinks = extractEntityLinks({ pick, instrumentType });
  const issuer = rawLinks.find((link) => link.entity_role === 'issuer');
  const fund = rawLinks.find((link) => link.entity_role === 'fund');
  const primaryTarget = rawLinks.find((link) => link.is_primary_origination_target && link.entity_cnpj)
    ?? rawLinks.find((link) => link.is_primary_origination_target);
  const issuerCnpj = issuer?.entity_cnpj ?? null;
  const issuerName = issuer?.entity_name ?? null;
  const fundCnpj = fund?.entity_cnpj ?? null;
  const fundName = fund?.entity_name ?? null;
  const offerId = pick(
    'Numero Registro Oferta', 'NR Registro Oferta', 'Numero Processo', 'NR Processo', 'Codigo Oferta', 'ID Oferta', 'Numero Oferta',
    'ID Documento', 'ID_DOCUMENTO',
  ) ?? pick.matching(/(numero|nr|codigo|id).*(registrooferta|oferta|processo|documento)/);
  const securityCode = pick('Codigo Ativo', 'Codigo Cetip', 'Codigo ISIN', 'ISIN', 'Codigo Negociacao', 'Codigo CVM', 'CD_CVM');
  const series = pick('Serie', 'Numero Serie', 'NR Serie', 'Classe Serie', 'Subclasse', 'Numero Emissao', 'NR Emissao', 'Emissao');
  const status = pick(
    'Situacao Oferta', 'Status Oferta', 'Modalidade Registro', 'Modalidade Oferta', 'Rito Oferta',
    'Situacao', 'Status', 'Situacao Fundo', 'Situacao Classe', 'SIT', 'SIT_EMISSOR',
  );
  const contentHash = stableHash(JSON.stringify(input.row));
  const normalizedIssuer = normalizeKey(issuerName ?? fundName ?? '');
  const entityIdentity = primaryTarget?.entity_cnpj ?? issuerCnpj ?? fundCnpj ?? normalizedIssuer;
  const offerIdentity = [offerId, securityCode, entityIdentity, series, eventDate, instrumentType]
    .filter(Boolean)
    .join('|');
  const snapshotIdentity = [
    entityIdentity,
    referenceDate ?? eventDate,
    input.fileName,
    series,
    dimensionHash(input.row),
    instrumentType,
  ].filter(Boolean).join('|');
  const naturalIdentity = input.datasetCode === 'cvm_offers' ? offerIdentity : snapshotIdentity;
  const recordKey = stableHash([
    input.datasetCode,
    naturalIdentity || `${input.resource.name}|${input.fileName}|${contentHash}`,
  ].join('|'));
  const entityCnpj = primaryTarget?.entity_cnpj ?? issuerCnpj ?? fundCnpj;
  const entityLinks: NormalizedCapitalMarketEntityLink[] = rawLinks.map((link) => ({
    ...link,
    dataset_code: input.datasetCode,
    record_key: recordKey,
    content_hash: contentHash,
    observed_at: input.observedAt,
    updated_at: input.observedAt,
  }));
  const metrics = extractMetrics({
    datasetCode: input.datasetCode,
    recordKey,
    contentHash,
    pick,
    row: input.row,
    fileName: input.fileName,
    referenceDate: referenceDate ?? eventDate,
    observedAt: input.observedAt,
  });
  const primaryVolume = ['offer_amount', 'outstanding_balance', 'fund_nav', 'issue_amount', 'captured_amount', 'receivables_balance']
    .map((code) => metrics.find((metric) => metric.metric_code === code)?.metric_value)
    .find((value) => value !== undefined) ?? null;

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
    volume: primaryVolume,
    entityRoles: entityLinks.map((link) => ({
      role: link.entity_role,
      cnpj: link.entity_cnpj,
      name: link.entity_name,
      primaryOriginationTarget: link.is_primary_origination_target,
    })),
    metricCodes: metrics.map((metric) => metric.metric_code),
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
      volume: primaryVolume,
      currency: 'BRL',
      source_url: input.resource.url,
      source_resource_name: input.resource.name,
      source_file_name: input.fileName,
      raw_payload: input.row,
      normalized_payload: normalizedPayload,
      observed_at: input.observedAt,
      updated_at: input.observedAt,
    },
    entityLinks,
    metrics,
  };
};

const normalizeRows = (input: {
  datasetCode: CvmDatasetCode;
  rows: Array<{ row: CsvRecord; fileName: string }>;
  resource: CvmResource;
  observedAt: string;
  maxRows: number;
}) => {
  const orderedRows = input.datasetCode === 'cvm_offers'
    ? [...input.rows].sort((left, right) => offerRowRecency(right.row) - offerRowRecency(left.row))
    : input.rows;
  const records: NormalizedCapitalMarketRecord[] = [];
  for (const entry of orderedRows) {
    const normalized = normalizeCapitalMarketRecord({
      datasetCode: input.datasetCode,
      row: entry.row,
      resource: input.resource,
      fileName: entry.fileName,
      observedAt: input.observedAt,
    });
    if (input.datasetCode === 'cvm_offers' && !TARGET_OFFER_INSTRUMENTS.has(normalized.event.instrument_type)) continue;
    records.push(normalized);
    if (records.length >= input.maxRows) break;
  }
  return records;
};

const relevantFinancialAccounts = new Set([
  '1', '1.01', '1.01.01', '1.01.03', '1.02',
  '2', '2.01', '2.01.04', '2.02', '2.02.01', '2.03',
  '3.01', '3.05', '3.08', '3.11',
  '6.01', '6.02', '6.03', '6.05',
]);

const fileIsRelevant = (datasetCode: CvmDatasetCode, fileName: string) => {
  if (!/\.csv$/i.test(fileName)) return false;
  if (datasetCode === 'cvm_company_itr' || datasetCode === 'cvm_company_dfp') {
    return /_(BPA|BPP|DRE|DFC_MD|DFC_MI)_(con|ind)_/i.test(fileName);
  }
  return true;
};

const rowIsRelevant = (datasetCode: CvmDatasetCode, row: CsvRecord) => {
  if (datasetCode !== 'cvm_company_itr' && datasetCode !== 'cvm_company_dfp') return true;
  const pick = rowAccessor(row);
  const accountCode = pick('CD CONTA', 'CD_CONTA', 'Codigo Conta');
  return Boolean(accountCode && relevantFinancialAccounts.has(accountCode));
};

export const fetchCvmResourceRecords = async (input: {
  datasetCode: CvmDatasetCode;
  resource: CvmResource;
  maxRows: number;
  observedAt?: string;
}): Promise<NormalizedCapitalMarketRecord[]> => {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const response = await fetchCvmWithRetry(input.resource.url, {
    headers: {
      accept: 'application/zip,text/csv,text/plain,*/*',
    },
  }, {
    label: `${input.datasetCode} resource ${input.resource.name}`,
    timeoutMs: 120_000,
  });
  if (!response.ok) throw new Error(`CVM resource failed: ${response.status} ${input.resource.url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';
  const isZip = /zip/i.test(contentType) || /\.zip(?:$|\?)/i.test(input.resource.url) || (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50);
  const files = isZip
    ? extractZipEntries(buffer, (name) => fileIsRelevant(input.datasetCode, name))
    : fileIsRelevant(input.datasetCode, input.resource.name || 'resource.csv')
      ? [{ name: input.resource.name || 'resource.csv', data: buffer }]
      : [];
  if (!files.length) throw new Error(`No relevant CSV file found in ${input.resource.name}.`);

  if (input.datasetCode === 'cvm_offers') {
    const rows = files.flatMap((file) => parseCsv(decodeBuffer(file.data)).map((row) => ({ row, fileName: file.name })));
    return normalizeRows({
      datasetCode: input.datasetCode,
      rows,
      resource: input.resource,
      observedAt,
      maxRows: input.maxRows,
    });
  }

  const records: NormalizedCapitalMarketRecord[] = [];
  for (const file of files) {
    const remaining = input.maxRows - records.length;
    if (remaining <= 0) break;
    const rows = parseCsv(decodeBuffer(file.data));
    for (const row of rows) {
      if (!rowIsRelevant(input.datasetCode, row)) continue;
      records.push(normalizeCapitalMarketRecord({
        datasetCode: input.datasetCode,
        row,
        resource: input.resource,
        fileName: file.name,
        observedAt,
      }));
      if (records.length >= input.maxRows) break;
    }
  }
  return records;
};
