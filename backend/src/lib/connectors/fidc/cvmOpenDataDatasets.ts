type CVMDatasetResource = {
  id: string;
  name?: string;
  format?: string;
  url?: string;
  created?: string;
  last_modified?: string;
  description?: string;
};

type CVMPackageResponse = {
  success: boolean;
  result?: {
    id: string;
    name: string;
    title?: string;
    notes?: string;
    metadata_modified?: string;
    resources?: CVMDatasetResource[];
  };
};

const CKAN_PACKAGE_SHOW = 'https://dados.cvm.gov.br/api/3/action/package_show?id=';

export type CVMOpenDataPackage = {
  datasetId: string;
  datasetName: string;
  title: string;
  notes?: string;
  metadataModified?: string;
  resources: Array<{
    id: string;
    name: string;
    format: string;
    url: string;
    created?: string;
    lastModified?: string;
  }>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`CVM package request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

function normalizePackage(payload: CVMPackageResponse): CVMOpenDataPackage {
  const result = payload.result;
  if (!payload.success || !result) {
    throw new Error('Invalid CVM CKAN package payload');
  }

  return {
    datasetId: result.id,
    datasetName: result.name,
    title: result.title ?? result.name,
    notes: result.notes ?? undefined,
    metadataModified: result.metadata_modified ?? undefined,
    resources: (result.resources ?? [])
      .filter((resource) => Boolean(resource.id && resource.url))
      .map((resource) => ({
        id: resource.id,
        name: resource.name ?? resource.id,
        format: (resource.format ?? 'unknown').toUpperCase(),
        url: resource.url!,
        created: resource.created ?? undefined,
        lastModified: resource.last_modified ?? undefined,
      })),
  };
}

export async function fetchCvmDatasetPackage(datasetId: string): Promise<CVMOpenDataPackage> {
  const payload = await fetchJson<CVMPackageResponse>(`${CKAN_PACKAGE_SHOW}${encodeURIComponent(datasetId)}`);
  return normalizePackage(payload);
}

export async function fetchCvmFidcInformeMensalPackage() {
  return fetchCvmDatasetPackage('fidc-doc-inf_mensal');
}

export async function fetchCvmFundosInvestimentoSearchAnchors() {
  return Promise.all([
    fetchCvmDatasetPackage('fidc-doc-inf_mensal'),
    fetchCvmDatasetPackage('fundos-estruturados-medidas'),
  ]);
}
