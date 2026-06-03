import type { CompanySeed, CompanySignal, EnrichmentRecord, MonitoringOutput, SourceCatalogEntry } from '../../types/platform.js';

const nowIso = () => new Date().toISOString();
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const onlyDigits = (value: string) => value.replace(/\D/g, '');
const sourceCode = (source: SourceCatalogEntry) => typeof source.metadata?.code === 'string' ? source.metadata.code : source.id;

const officialConfidence = (source: SourceCatalogEntry, status: 'real' | 'partial') => {
  const category = normalize(source.category ?? '');
  const base = /cvm|bcb|pncp|fidc|central_bank|procurement|capital_markets/.test(category) ? 0.92 : 0.78;
  return Number((status === 'real' ? base : base * 0.62).toFixed(2));
};

const safeFetchJson = async (url: string, headers?: Record<string, string>) => {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json', ...(headers ?? {}) } });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 180)}`);
    return { status: 'real' as const, data: text ? JSON.parse(text) : {}, error: null as string | null, url };
  } catch (error) {
    return { status: 'partial' as const, data: {}, error: error instanceof Error ? error.message : String(error), url };
  }
};

const safeFetchText = async (url: string) => {
  try {
    const response = await fetch(url, { headers: { accept: 'text/csv,text/plain,application/zip,*/*' } });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 180)}`);
    return { status: 'real' as const, text, error: null as string | null, url };
  } catch (error) {
    return { status: 'partial' as const, text: '', error: error instanceof Error ? error.message : String(error), url };
  }
};

const parseCsvPreview = (csv: string, maxRows = 5) => {
  const lines = csv.split(/\r?\n/).filter(Boolean).slice(0, maxRows + 1);
  if (!lines.length) return { columns: [], rows: [] as Record<string, string>[] };
  const separator = lines[0].includes(';') ? ';' : ',';
  const columns = lines[0].split(separator).map((item) => item.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(separator).map((item) => item.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
  });
  return { columns, rows };
};

const buildOutput = ({
  company,
  source,
  title,
  summary,
  status,
  sourceUrl,
  payload,
}: {
  company: CompanySeed;
  source: SourceCatalogEntry;
  title: string;
  summary: string;
  status: 'real' | 'partial';
  sourceUrl: string;
  payload: Record<string, unknown>;
}): MonitoringOutput => {
  const collectedAt = nowIso();
  const confidenceScore = officialConfidence(source, status);
  return {
    id: crypto.randomUUID(),
    companyId: company.id,
    sourceId: source.id,
    title,
    summary,
    collectedAt,
    confidenceScore,
    connectorStatus: status,
    normalizedPayload: {
      ...payload,
      sourceCode: sourceCode(source),
      sourceName: source.name,
      sourceCategory: source.category,
      sourceType: source.sourceType,
      sourceUrl,
      timestamp: collectedAt,
      confidenceScore,
      loader: 'official_public_loader_v1',
    },
  };
};

const buildSignal = ({
  company,
  source,
  signalType,
  signalStrength,
  note,
  status,
  sourceUrl,
}: {
  company: CompanySeed;
  source: SourceCatalogEntry;
  signalType: string;
  signalStrength: number;
  note: string;
  status: 'real' | 'partial';
  sourceUrl: string;
}): CompanySignal => {
  const createdAt = nowIso();
  const confidenceScore = officialConfidence(source, status);
  return {
    id: crypto.randomUUID(),
    companyId: company.id,
    sourceId: source.id,
    signalType,
    signalStrength,
    confidenceScore,
    evidencePayload: {
      note,
      source: source.id,
      sourceCode: sourceCode(source),
      sourceName: source.name,
      sourceUrl,
      timestamp: createdAt,
      confidenceScore,
      loader: 'official_public_loader_v1',
    },
    observedVsInferred: 'observed',
    createdAt,
  };
};

const buildEnrichment = ({
  company,
  source,
  enrichmentType,
  provider,
  payload,
}: {
  company: CompanySeed;
  source: SourceCatalogEntry;
  enrichmentType: string;
  provider: string;
  payload: Record<string, unknown>;
}): EnrichmentRecord => ({
  id: crypto.randomUUID(),
  companyId: company.id,
  enrichmentType,
  provider,
  payload: {
    ...payload,
    sourceId: source.id,
    sourceCode: sourceCode(source),
    loader: 'official_public_loader_v1',
  },
  observedVsInferred: 'observed',
  createdAt: nowIso(),
});

const cvmFidcUrl = () => {
  const year = new Date().getUTCFullYear();
  return `https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/inf_mensal_fidc_${year}.csv`;
};

const loadCvmFidc = async (company: CompanySeed, source: SourceCatalogEntry) => {
  const url = cvmFidcUrl();
  const response = await safeFetchText(url);
  const cnpj = onlyDigits(company.cnpj);
  const hasCompanyMatch = cnpj ? response.text.includes(cnpj) : false;
  const preview = parseCsvPreview(response.text, 3);
  const status = response.status;
  const outputs = [buildOutput({
    company,
    source,
    title: `CVM FIDC oficiais · ${company.tradeName}`,
    summary: hasCompanyMatch
      ? `Possível ocorrência de CNPJ da empresa em informe mensal de FIDC CVM.`
      : `Consulta ao dataset oficial de informes mensais FIDC CVM sem match direto de CNPJ.` ,
    status,
    sourceUrl: url,
    payload: {
      dataset: 'CVM FIDC INF_MENSAL',
      companyCnpj: cnpj,
      hasCompanyMatch,
      preview,
      error: response.error,
    },
  })];

  const signals = hasCompanyMatch
    ? [buildSignal({
      company,
      source,
      signalType: 'has_fidc_or_fidc_exposure',
      signalStrength: 92,
      note: `CNPJ encontrado em dataset oficial de informe mensal FIDC CVM. Validar papel da empresa na estrutura.`,
      status,
      sourceUrl: url,
    })]
    : [];

  const enrichments = [buildEnrichment({
    company,
    source,
    enrichmentType: 'cvm_fidc_dataset_check',
    provider: 'CVM Dados Abertos',
    payload: { hasCompanyMatch, companyCnpj: cnpj, datasetUrl: url, previewColumns: preview.columns, checkedAt: nowIso() },
  })];

  return { outputs, signals, enrichments };
};

const bcbIfDataCadastroUrl = (company: CompanySeed) => {
  const cnpj = onlyDigits(company.cnpj).slice(0, 8);
  const params = new URLSearchParams();
  params.set('$format', 'json');
  params.set('$top', '5');
  if (cnpj) params.set('$filter', `Cnpj eq '${cnpj}'`);
  return `https://olinda.bcb.gov.br/olinda/servico/IFDATA/versao/v1/odata/IfDataCadastro?${params.toString()}`;
};

const loadBcbIfData = async (company: CompanySeed, source: SourceCatalogEntry) => {
  const url = bcbIfDataCadastroUrl(company);
  const response = await safeFetchJson(url);
  const records = Array.isArray((response.data as any).value) ? (response.data as any).value : [];
  const status = response.status;
  const isRegulated = records.length > 0;
  const outputs = [buildOutput({
    company,
    source,
    title: `BCB IFData · ${company.tradeName}`,
    summary: isRegulated
      ? `Empresa ou raiz de CNPJ encontrada no cadastro IFData/BCB.`
      : `Consulta IFData/BCB sem match direto para raiz de CNPJ.`,
    status,
    sourceUrl: url,
    payload: { provider: 'BCB IFData', records, isRegulatedFinancialInstitution: isRegulated, error: response.error },
  })];

  const signals = isRegulated
    ? [buildSignal({
      company,
      source,
      signalType: 'regulated_financial_institution_signal',
      signalStrength: 88,
      note: `Match encontrado no IFData/BCB. A empresa pode ter relação com instituição financeira regulada.`,
      status,
      sourceUrl: url,
    })]
    : [];

  const enrichments = [buildEnrichment({
    company,
    source,
    enrichmentType: 'bcb_ifdata_check',
    provider: 'Banco Central IFData',
    payload: { isRegulatedFinancialInstitution: isRegulated, records, queryUrl: url, checkedAt: nowIso() },
  })];

  return { outputs, signals, enrichments };
};

const pncpContractsUrl = (company: CompanySeed) => {
  const endDate = new Date();
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear() - 1, endDate.getUTCMonth(), endDate.getUTCDate()));
  const formatDate = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');
  const params = new URLSearchParams();
  params.set('dataInicial', formatDate(startDate));
  params.set('dataFinal', formatDate(endDate));
  params.set('pagina', '1');
  params.set('tamanhoPagina', '10');
  params.set('cnpj', onlyDigits(company.cnpj));
  return `https://pncp.gov.br/api/consulta/v1/contratos?${params.toString()}`;
};

const loadPncpContracts = async (company: CompanySeed, source: SourceCatalogEntry) => {
  const url = pncpContractsUrl(company);
  const response = await safeFetchJson(url);
  const data = response.data as any;
  const records = Array.isArray(data.data) ? data.data : Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
  const status = response.status;
  const hasContracts = records.length > 0;
  const outputs = [buildOutput({
    company,
    source,
    title: `PNCP contratos públicos · ${company.tradeName}`,
    summary: hasContracts
      ? `Foram encontrados contratos públicos no PNCP para o CNPJ consultado.`
      : `Consulta PNCP sem contratos públicos encontrados para o CNPJ consultado.`,
    status,
    sourceUrl: url,
    payload: { provider: 'PNCP', records, hasPublicContracts: hasContracts, error: response.error },
  })];

  const signals = hasContracts
    ? [buildSignal({
      company,
      source,
      signalType: 'public_contract_receivables',
      signalStrength: 84,
      note: `Contratos públicos encontrados no PNCP. Avaliar recebíveis governamentais e concentração de sacado público.`,
      status,
      sourceUrl: url,
    })]
    : [];

  const enrichments = [buildEnrichment({
    company,
    source,
    enrichmentType: 'pncp_contracts_check',
    provider: 'PNCP',
    payload: { hasPublicContracts: hasContracts, recordsCount: records.length, queryUrl: url, checkedAt: nowIso() },
  })];

  return { outputs, signals, enrichments };
};

const isSource = (source: SourceCatalogEntry, codes: string[]) => codes.includes(sourceCode(source));

export async function runOfficialLoaders(company: CompanySeed, sources: SourceCatalogEntry[]) {
  const officialSources = sources.filter((source) => isSource(source, [
    'src_cvm_fidc_informe_mensal',
    'src_bcb_ifdata',
    'src_pncp_contracts',
  ]));

  const results = await Promise.all(officialSources.map((source) => {
    const code = sourceCode(source);
    if (code === 'src_cvm_fidc_informe_mensal') return loadCvmFidc(company, source);
    if (code === 'src_bcb_ifdata') return loadBcbIfData(company, source);
    if (code === 'src_pncp_contracts') return loadPncpContracts(company, source);
    return Promise.resolve({ outputs: [], signals: [], enrichments: [] });
  }));

  return {
    outputs: results.flatMap((result) => result.outputs),
    signals: results.flatMap((result) => result.signals),
    enrichments: results.flatMap((result) => result.enrichments),
  };
}
