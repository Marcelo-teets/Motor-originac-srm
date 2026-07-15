export type CvmDatasetCode =
  | 'cvm_offers'
  | 'cvm_fund_registry'
  | 'cvm_fidc_monthly'
  | 'cvm_cri_monthly'
  | 'cvm_cra_monthly'
  | 'cvm_fii_monthly';

export type CvmDatasetDefinition = {
  code: CvmDatasetCode;
  sourceCode: string;
  packageId: string;
  eventType: string;
  instrumentFallback: string;
  resourcePattern: RegExp;
  resourceLimit: number;
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
};

export const CVM_DATASETS: Record<CvmDatasetCode, CvmDatasetDefinition> = {
  cvm_offers: {
    code: 'cvm_offers',
    sourceCode: 'src_cvm_offers',
    packageId: 'oferta-distrib',
    eventType: 'public_offering',
    instrumentFallback: 'OFERTA PUBLICA',
    resourcePattern: /oferta.*(distribuicao|resolucao[_ -]?160).*(csv|zip)$/i,
    resourceLimit: 4,
  },
  cvm_fund_registry: {
    code: 'cvm_fund_registry',
    sourceCode: 'src_cvm_fund_registry',
    packageId: 'fi-cad',
    eventType: 'fund_registration',
    instrumentFallback: 'FUNDO',
    resourcePattern: /registro.*(fundo|classe|subclasse).*(csv|zip)$/i,
    resourceLimit: 4,
  },
  cvm_fidc_monthly: {
    code: 'cvm_fidc_monthly',
    sourceCode: 'src_cvm_fidc_monthly',
    packageId: 'fidc-doc-inf_mensal',
    eventType: 'fidc_monthly_snapshot',
    instrumentFallback: 'FIDC',
    resourcePattern: /inf[_ -]?mensal[_ -]?fidc.*(csv|zip)$/i,
    resourceLimit: 1,
  },
  cvm_cri_monthly: {
    code: 'cvm_cri_monthly',
    sourceCode: 'src_cvm_cri_monthly',
    packageId: 'securit-doc-inf_mensal_cri',
    eventType: 'cri_monthly_snapshot',
    instrumentFallback: 'CRI',
    resourcePattern: /inf[_ -]?mensal[_ -]?cri.*(csv|zip)$/i,
    resourceLimit: 1,
  },
  cvm_cra_monthly: {
    code: 'cvm_cra_monthly',
    sourceCode: 'src_cvm_cra_monthly',
    packageId: 'securit-doc-inf_mensal_cra',
    eventType: 'cra_monthly_snapshot',
    instrumentFallback: 'CRA',
    resourcePattern: /inf[_ -]?mensal[_ -]?cra.*(csv|zip)$/i,
    resourceLimit: 1,
  },
  cvm_fii_monthly: {
    code: 'cvm_fii_monthly',
    sourceCode: 'src_cvm_fii_monthly',
    packageId: 'fii-doc-inf_mensal',
    eventType: 'fii_monthly_snapshot',
    instrumentFallback: 'FII',
    resourcePattern: /inf[_ -]?mensal[_ -]?fii.*(csv|zip)$/i,
    resourceLimit: 1,
  },
};

export const normalizeKey = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toLowerCase();

const normalizeReference = (reference?: string) => String(reference ?? '').replace(/\D/g, '');

const resourceTimestamp = (resource: CvmResource) => Date.parse(resource.last_modified ?? resource.created ?? '') || 0;

export const selectDatasetResources = (
  definition: CvmDatasetDefinition,
  resources: CvmResource[],
  reference?: string,
): CvmResource[] => {
  const referenceKey = normalizeReference(reference);
  const supported = resources
    .filter((resource) => Boolean(resource.url) && definition.resourcePattern.test(`${resource.name} ${resource.url}`));
  const referenced = referenceKey
    ? supported.filter((resource) => normalizeReference(`${resource.name} ${resource.url}`).includes(referenceKey))
    : supported;
  const candidates = referenced
    .map((resource) => ({ resource, score: resourceTimestamp(resource) }))
    .sort((a, b) => b.score - a.score || b.resource.name.localeCompare(a.resource.name));

  if (!candidates.length && referenceKey) return selectDatasetResources(definition, resources);

  const selected: CvmResource[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    const family = normalizeKey(item.resource.name).replace(/\d{4,8}/g, '');
    if (seen.has(family)) continue;
    seen.add(family);
    selected.push(item.resource);
    if (selected.length >= definition.resourceLimit) break;
  }
  return selected;
};

export const discoverCvmResources = async (
  datasetCode: CvmDatasetCode,
  reference?: string,
): Promise<CvmResource[]> => {
  const definition = CVM_DATASETS[datasetCode];
  const endpoint = `https://dados.cvm.gov.br/api/3/action/package_show?id=${encodeURIComponent(definition.packageId)}`;
  const response = await fetch(endpoint, { headers: { accept: 'application/json', 'user-agent': 'Motor-Origination/1.0' } });
  if (!response.ok) throw new Error(`CVM CKAN ${definition.packageId} failed: ${response.status} ${await response.text()}`);
  const body = await response.json() as CkanPackageResponse;
  if (!body.success || !body.result) throw new Error(`CVM CKAN ${definition.packageId} returned an invalid package response.`);
  const resources = selectDatasetResources(definition, body.result.resources ?? [], reference);
  if (!resources.length) throw new Error(`No supported resource found for ${datasetCode}${reference ? ` at ${reference}` : ''}.`);
  return resources;
};
