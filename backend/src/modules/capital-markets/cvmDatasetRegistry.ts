import { fetchCvmWithRetry } from './cvmHttp.js';

export type CvmDatasetCode =
  | 'cvm_offers'
  | 'cvm_fund_registry'
  | 'cvm_fidc_monthly'
  | 'cvm_cri_monthly'
  | 'cvm_cra_monthly'
  | 'cvm_fii_monthly'
  | 'cvm_securitization_ots'
  | 'cvm_fund_documents'
  | 'cvm_fund_document_deliveries'
  | 'cvm_company_fre'
  | 'cvm_company_itr'
  | 'cvm_company_dfp'
  | 'debentures_snd';

export type CapitalMarketEntityRole =
  | 'issuer'
  | 'securitizer'
  | 'debtor'
  | 'originator'
  | 'assignor'
  | 'fund'
  | 'administrator'
  | 'manager'
  | 'custodian'
  | 'coordinator'
  | 'fiduciary_agent'
  | 'auditor';

export type CvmDatasetDefinition = {
  code: CvmDatasetCode;
  sourceCode: string;
  packageId: string;
  eventType: string;
  instrumentFallback: string;
  resourcePattern: RegExp;
  resourceLimit: number;
  dedupeByFamily?: boolean;
};

export type CvmResource = {
  id?: string;
  name: string;
  url: string;
  format?: string;
  last_modified?: string | null;
  created?: string | null;
};

type CkanPackageResponse = {
  success: boolean;
  result?: {
    name?: string;
    title?: string;
    metadata_modified?: string;
    resources?: CvmResource[];
  };
  error?: unknown;
};

export type CsvRecord = Record<string, string>;

export type NormalizedCapitalMarketEntityLink = {
  dataset_code: CvmDatasetCode;
  record_key: string;
  content_hash: string;
  entity_key: string;
  entity_role: CapitalMarketEntityRole;
  entity_cnpj: string | null;
  entity_name: string | null;
  is_primary_origination_target: boolean;
  resolution_confidence: number;
  source_fields: string[];
  observed_at: string;
  updated_at: string;
};

export type NormalizedCapitalMarketMetric = {
  dataset_code: CvmDatasetCode;
  record_key: string;
  content_hash: string;
  metric_code: string;
  metric_label: string | null;
  metric_value: number;
  metric_unit: 'BRL' | 'PERCENT' | 'COUNT' | 'DAYS' | 'RATIO';
  reference_date: string | null;
  measurement_scope: string | null;
  source_column: string;
  observed_at: string;
  updated_at: string;
};

export type NormalizedCapitalMarketRecord = {
  bronze: {
    dataset_code: CvmDatasetCode;
    record_key: string;
    ref_date: string | null;
    entity_cnpj: string | null;
    payload: Record<string, unknown>;
    source_url: string;
    content_hash: string;
  };
  event: {
    dataset_code: CvmDatasetCode;
    source_code: string;
    record_key: string;
    content_hash: string;
    event_type: string;
    instrument_type: string;
    issuer_cnpj: string | null;
    issuer_name: string | null;
    fund_cnpj: string | null;
    fund_name: string | null;
    security_code: string | null;
    offer_id: string | null;
    series: string | null;
    status: string | null;
    reference_date: string | null;
    event_date: string | null;
    maturity_date: string | null;
    volume: number | null;
    currency: string;
    source_url: string;
    source_resource_name: string;
    source_file_name: string;
    raw_payload: CsvRecord;
    normalized_payload: Record<string, unknown>;
    observed_at: string;
    updated_at: string;
  };
  entityLinks: NormalizedCapitalMarketEntityLink[];
  metrics: NormalizedCapitalMarketMetric[];
};

export const CVM_DATASETS: Record<CvmDatasetCode, CvmDatasetDefinition> = {
  cvm_offers: {
    code: 'cvm_offers', sourceCode: 'src_cvm_offers', packageId: 'oferta-distrib', eventType: 'public_offering',
    instrumentFallback: 'OFERTA PUBLICA', resourcePattern: /oferta.*(distribuicao|resolucao[_ -]?160).*(csv|zip)$/i, resourceLimit: 4,
  },
  cvm_fund_registry: {
    code: 'cvm_fund_registry', sourceCode: 'src_cvm_fund_registry', packageId: 'fi-cad', eventType: 'fund_registration',
    instrumentFallback: 'FUNDO', resourcePattern: /registro.*(fundo|classe|subclasse).*(csv|zip)$/i, resourceLimit: 4,
  },
  cvm_fidc_monthly: {
    code: 'cvm_fidc_monthly', sourceCode: 'src_cvm_fidc_monthly', packageId: 'fidc-doc-inf_mensal', eventType: 'fidc_monthly_snapshot',
    instrumentFallback: 'FIDC', resourcePattern: /inf[_ -]?mensal[_ -]?fidc.*(csv|zip)$/i, resourceLimit: 1,
  },
  cvm_cri_monthly: {
    code: 'cvm_cri_monthly', sourceCode: 'src_cvm_cri_monthly', packageId: 'securit-doc-inf_mensal_cri', eventType: 'cri_monthly_snapshot',
    instrumentFallback: 'CRI', resourcePattern: /inf[_ -]?mensal[_ -]?cri.*(csv|zip)$/i, resourceLimit: 1,
  },
  cvm_cra_monthly: {
    code: 'cvm_cra_monthly', sourceCode: 'src_cvm_cra_monthly', packageId: 'securit-doc-inf_mensal_cra', eventType: 'cra_monthly_snapshot',
    instrumentFallback: 'CRA', resourcePattern: /inf[_ -]?mensal[_ -]?cra.*(csv|zip)$/i, resourceLimit: 1,
  },
  cvm_fii_monthly: {
    code: 'cvm_fii_monthly', sourceCode: 'src_cvm_fii_monthly', packageId: 'fii-doc-inf_mensal', eventType: 'fii_monthly_snapshot',
    instrumentFallback: 'FII', resourcePattern: /inf[_ -]?mensal[_ -]?fii.*(csv|zip)$/i, resourceLimit: 1,
  },
  cvm_securitization_ots: {
    code: 'cvm_securitization_ots', sourceCode: 'src_cvm_securitization_ots', packageId: 'securit-doc-inf_mensal_ots', eventType: 'securitization_monthly_snapshot',
    instrumentFallback: 'OUTRO TITULO SECURITIZACAO', resourcePattern: /inf[_ -]?mensal[_ -]?ots.*(csv|zip)$/i, resourceLimit: 1,
  },
  cvm_fund_documents: {
    code: 'cvm_fund_documents', sourceCode: 'src_cvm_fund_documents', packageId: 'fi-doc-eventual', eventType: 'fund_document_filing',
    instrumentFallback: 'FUNDO', resourcePattern: /(eventual[_ -]?fi|documentos.*eventuais.*fundos).*(csv|zip)$/i, resourceLimit: 1,
  },
  cvm_fund_document_deliveries: {
    code: 'cvm_fund_document_deliveries', sourceCode: 'src_cvm_fundos_documentos_entrega', packageId: 'fi-doc-entrega', eventType: 'fund_document_delivery',
    instrumentFallback: 'FUNDO', resourcePattern: /(fi[_ -]?entrega[_ -]?documento|documentos.*entregues.*fundos).*(csv|zip)$/i,
    resourceLimit: 14, dedupeByFamily: false,
  },
  cvm_company_fre: {
    code: 'cvm_company_fre', sourceCode: 'src_cvm_fre_capital_structure', packageId: 'cia_aberta-doc-fre', eventType: 'company_reference_snapshot',
    instrumentFallback: 'COMPANHIA ABERTA', resourcePattern: /(fre[_ -]?cia[_ -]?aberta|formularios?.*referencia.*cias?.*abertas?).*(csv|zip)$/i, resourceLimit: 1,
  },
  cvm_company_itr: {
    code: 'cvm_company_itr', sourceCode: 'src_cvm_company_itr', packageId: 'cia_aberta-doc-itr', eventType: 'company_quarterly_financial_snapshot',
    instrumentFallback: 'COMPANHIA ABERTA', resourcePattern: /(itr[_ -]?cia[_ -]?aberta|informacoes?.*trimestrais.*cias?.*abertas?).*(csv|zip)$/i, resourceLimit: 1,
  },
  cvm_company_dfp: {
    code: 'cvm_company_dfp', sourceCode: 'src_cvm_company_dfp', packageId: 'cia_aberta-doc-dfp', eventType: 'company_annual_financial_snapshot',
    instrumentFallback: 'COMPANHIA ABERTA', resourcePattern: /(dfp[_ -]?cia[_ -]?aberta|demonstracoes?.*financeiras.*padronizadas.*cias?.*abertas?).*(csv|zip)$/i, resourceLimit: 1,
  },
  debentures_snd: {
    code: 'debentures_snd', sourceCode: 'src_debentures_snd', packageId: 'snd-public-debentures', eventType: 'debenture_registry_snapshot',
    instrumentFallback: 'DEBENTURE', resourcePattern: /debentures_snd_public_registered\.csv$/i, resourceLimit: 1,
  },
};

export const normalizeKey = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toLowerCase();

const normalizeReference = (reference?: string) => String(reference ?? '').replace(/\D/g, '');
const resourceTimestamp = (resource: CvmResource) => Date.parse(resource.last_modified ?? resource.created ?? '') || 0;

const resourcePeriod = (resource: CvmResource) => {
  const text = `${resource.name} ${resource.url}`;
  const monthly = [...text.matchAll(/(?:^|\D)((?:19|20)\d{2})(0[1-9]|1[0-2])(?:\D|$)/g)].at(-1);
  if (monthly) return Number(`${monthly[1]}${monthly[2]}`);
  const annual = [...text.matchAll(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/g)].at(-1);
  return annual ? Number(`${annual[1]}00`) : 0;
};

const resourcePriority = (definition: CvmDatasetDefinition, resource: CvmResource) => {
  if (definition.code !== 'cvm_offers') return 0;
  const key = normalizeKey(`${resource.name} ${resource.url}`);
  if (key.includes('resolucao160')) return 20;
  if (key.includes('ofertadistribuicao')) return 10;
  return 0;
};

const resourceFileName = (resource: CvmResource) => {
  const cleanUrl = resource.url.split('?')[0] ?? resource.url;
  const fromUrl = decodeURIComponent(cleanUrl.split('/').at(-1) ?? '').trim();
  const supportedFromUrl = /\.(csv|zip)$/i.test(fromUrl);
  const supportedFromName = /\.(csv|zip)$/i.test(resource.name);
  return supportedFromName || !supportedFromUrl ? resource.name : fromUrl;
};

export const normalizeCvmResourceName = (resource: CvmResource): CvmResource => ({
  ...resource,
  name: resourceFileName(resource),
});

export const isCvmMetadataResource = (resource: CvmResource) => {
  const key = normalizeKey(`${resource.name} ${resource.url}`);
  return key.includes('dicionariodedados')
    || key.includes('datadictionary')
    || key.includes('documentacaodados')
    || key.includes('/meta/');
};

export const selectDatasetResources = (
  definition: CvmDatasetDefinition,
  resources: CvmResource[],
  reference?: string,
): CvmResource[] => {
  const referenceKey = normalizeReference(reference);
  const supported = resources
    .filter((resource) => Boolean(resource.url)
      && !isCvmMetadataResource(resource)
      && definition.resourcePattern.test(`${resource.name} ${resource.url}`))
    .map((resource) => definition.code === 'cvm_offers' ? resource : normalizeCvmResourceName(resource));
  const referenced = referenceKey
    ? supported.filter((resource) => normalizeReference(`${resource.name} ${resource.url}`).includes(referenceKey))
    : supported;
  const candidates = referenced
    .map((resource) => ({
      resource,
      priority: resourcePriority(definition, resource),
      period: resourcePeriod(resource),
      timestamp: resourceTimestamp(resource),
    }))
    .sort((a, b) => b.priority - a.priority
      || b.period - a.period
      || b.timestamp - a.timestamp
      || b.resource.name.localeCompare(a.resource.name));

  if (!candidates.length && referenceKey) return selectDatasetResources(definition, resources);

  const selected: CvmResource[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    const family = normalizeKey(item.resource.name).replace(/\d{4,8}/g, '');
    if (definition.dedupeByFamily !== false && seen.has(family)) continue;
    seen.add(family);
    selected.push(item.resource);
    if (selected.length >= definition.resourceLimit) break;
  }
  return selected;
};

const debenturesSndResource = (): CvmResource => {
  const endpoint = new URL(
    '/exploreosnd/consultaadados/emissoesdedebentures/caracteristicas_e.asp',
    'https://www.debentures.com.br',
  );
  endpoint.searchParams.set('op_exc', 'False');
  endpoint.searchParams.set('tip_deb', 'publicas');
  return {
    id: 'snd-public-registered-debentures',
    name: 'debentures_snd_public_registered.csv',
    url: endpoint.toString(),
    format: 'csv',
  };
};

export const discoverCvmResources = async (
  datasetCode: CvmDatasetCode,
  reference?: string,
): Promise<CvmResource[]> => {
  if (datasetCode === 'debentures_snd') return [debenturesSndResource()];
  const definition = CVM_DATASETS[datasetCode];
  const endpoint = `https://dados.cvm.gov.br/api/3/action/package_show?id=${encodeURIComponent(definition.packageId)}`;
  const response = await fetchCvmWithRetry(endpoint, {
    headers: { accept: 'application/json' },
  }, {
    label: `CKAN package ${definition.packageId}`,
  });
  if (!response.ok) throw new Error(`CVM CKAN ${definition.packageId} failed: ${response.status} ${await response.text()}`);
  const body = await response.json() as CkanPackageResponse;
  if (!body.success || !body.result) throw new Error(`CVM CKAN ${definition.packageId} returned an invalid package response.`);
  const resources = selectDatasetResources(definition, body.result.resources ?? [], reference);
  if (!resources.length) throw new Error(`No supported resource found for ${datasetCode}${reference ? ` at ${reference}` : ''}.`);
  return resources;
};
