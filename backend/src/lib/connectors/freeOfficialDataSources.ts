import type { CompanySeed, CompanySignal, MonitoringOutput, SourceCatalogEntry } from '../../types/platform.js';

const DIRECT_SOURCE_CODES = [
  'src_wayback_company_history',
  'src_common_crawl_company_history',
  'src_github_public_api',
] as const;

type DirectSourceCode = typeof DIRECT_SOURCE_CODES[number];
type ConnectorStatus = 'real' | 'partial';

type DirectSourceRun = {
  code: DirectSourceCode;
  status: ConnectorStatus;
  sourceUrl: string;
  title: string;
  summary: string;
  confidenceScore: number;
  payload: Record<string, unknown>;
  signal?: {
    type: string;
    strength: number;
    confidenceScore: number;
    note: string;
    evidenceUrl: string;
  };
};

const normalizeText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const sourceCode = (source: SourceCatalogEntry) => {
  const explicit = typeof source.metadata?.code === 'string' ? source.metadata.code : '';
  if (explicit) return explicit;
  return `src_${normalizeText(source.name).replace(/\s+/g, '_')}`;
};

const enabledSourceCodes = (sources: SourceCatalogEntry[]) => new Set(
  sources
    .filter((source) => source.status !== 'planned')
    .map(sourceCode),
);

const companyDomain = (website: string) => {
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return website
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .toLowerCase();
  }
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'unknown_error';

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 6_500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

const partialRun = (code: DirectSourceCode, sourceUrl: string, title: string, error: unknown): DirectSourceRun => ({
  code,
  status: 'partial',
  sourceUrl,
  title,
  summary: `Fonte indisponível nesta execução: ${errorMessage(error)}`,
  confidenceScore: 0.38,
  payload: {
    error: errorMessage(error),
    fallback: true,
  },
});

async function runWayback(company: CompanySeed): Promise<DirectSourceRun> {
  const code: DirectSourceCode = 'src_wayback_company_history';
  const domain = companyDomain(company.website);
  const endpoint = new URL('https://web.archive.org/cdx/search/cdx');
  endpoint.searchParams.set('url', `${domain}/*`);
  endpoint.searchParams.set('output', 'json');
  endpoint.searchParams.set('filter', 'statuscode:200');
  endpoint.searchParams.append('filter', 'mimetype:text/html');
  endpoint.searchParams.set('fl', 'timestamp,original,digest,statuscode');
  endpoint.searchParams.set('collapse', 'digest');
  endpoint.searchParams.set('limit', '8');
  endpoint.searchParams.set('from', String(new Date().getUTCFullYear() - 3));

  try {
    const response = await fetchWithTimeout(endpoint.toString(), {
      headers: { accept: 'application/json', 'user-agent': 'Motor-Origination/1.0' },
    });
    if (!response.ok) throw new Error(`Wayback status ${response.status}`);

    const data = await response.json() as unknown;
    const rows = Array.isArray(data)
      ? data.slice(1).filter((row): row is unknown[] => Array.isArray(row))
      : [];
    const snapshots = rows.slice(0, 8).map((row) => ({
      timestamp: String(row[0] ?? ''),
      url: String(row[1] ?? ''),
      digest: String(row[2] ?? ''),
      statusCode: String(row[3] ?? ''),
    }));

    return {
      code,
      status: 'real',
      sourceUrl: endpoint.toString(),
      title: `Wayback history · ${company.tradeName}`,
      summary: snapshots.length
        ? `${snapshots.length} versões públicas recentes do domínio foram localizadas.`
        : 'Nenhuma versão recente foi localizada no recorte consultado.',
      confidenceScore: snapshots.length ? 0.78 : 0.62,
      payload: { domain, snapshotCount: snapshots.length, snapshots },
    };
  } catch (error) {
    return partialRun(code, endpoint.toString(), `Wayback history · ${company.tradeName}`, error);
  }
}

async function runCommonCrawl(company: CompanySeed): Promise<DirectSourceRun> {
  const code: DirectSourceCode = 'src_common_crawl_company_history';
  const domain = companyDomain(company.website);
  const collectionsEndpoint = 'https://index.commoncrawl.org/collinfo.json';

  try {
    const collectionsResponse = await fetchWithTimeout(collectionsEndpoint, {
      headers: { accept: 'application/json', 'user-agent': 'Motor-Origination/1.0' },
    });
    if (!collectionsResponse.ok) throw new Error(`Common Crawl collections status ${collectionsResponse.status}`);
    const collections = await collectionsResponse.json() as Array<Record<string, unknown>>;
    const cdxApi = String(collections?.[0]?.['cdx-api'] ?? '');
    if (!cdxApi) throw new Error('Common Crawl cdx-api ausente');

    const endpoint = new URL(cdxApi);
    endpoint.searchParams.set('url', `${domain}/*`);
    endpoint.searchParams.set('output', 'json');
    endpoint.searchParams.set('filter', 'status:200');
    endpoint.searchParams.append('filter', 'mime:text/html');
    endpoint.searchParams.set('pageSize', '5');

    const response = await fetchWithTimeout(endpoint.toString(), {
      headers: { accept: 'application/x-ndjson, application/json', 'user-agent': 'Motor-Origination/1.0' },
    });
    if (!response.ok) throw new Error(`Common Crawl index status ${response.status}`);
    const body = await response.text();
    const captures = body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 5)
      .flatMap((line) => {
        try {
          const row = JSON.parse(line) as Record<string, unknown>;
          return [{
            timestamp: String(row.timestamp ?? ''),
            url: String(row.url ?? ''),
            digest: String(row.digest ?? ''),
            filename: String(row.filename ?? ''),
            offset: String(row.offset ?? ''),
            length: String(row.length ?? ''),
          }];
        } catch {
          return [];
        }
      });

    return {
      code,
      status: 'real',
      sourceUrl: endpoint.toString(),
      title: `Common Crawl history · ${company.tradeName}`,
      summary: captures.length
        ? `${captures.length} capturas públicas do domínio foram localizadas no índice mais recente.`
        : 'Nenhuma captura foi localizada no índice mais recente.',
      confidenceScore: captures.length ? 0.75 : 0.6,
      payload: { domain, collection: collections?.[0]?.id ?? null, captureCount: captures.length, captures },
    };
  } catch (error) {
    return partialRun(code, collectionsEndpoint, `Common Crawl history · ${company.tradeName}`, error);
  }
}

type GitHubRepository = {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  homepage?: string | null;
  pushed_at?: string | null;
  updated_at?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  archived?: boolean;
};

async function runGitHub(company: CompanySeed): Promise<DirectSourceRun> {
  const code: DirectSourceCode = 'src_github_public_api';
  const domain = companyDomain(company.website);
  const domainToken = domain.split('.')[0] || company.tradeName;
  const endpoint = new URL('https://api.github.com/search/repositories');
  endpoint.searchParams.set('q', `${domainToken} in:name,description`);
  endpoint.searchParams.set('sort', 'updated');
  endpoint.searchParams.set('order', 'desc');
  endpoint.searchParams.set('per_page', '10');

  try {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    const response = await fetchWithTimeout(endpoint.toString(), {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'Motor-Origination/1.0',
        'x-github-api-version': '2022-11-28',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub status ${response.status}`);
    const data = await response.json() as { items?: GitHubRepository[] };

    const normalizedName = normalizeText(company.tradeName).replace(/\s+/g, '');
    const repositories = (data.items ?? [])
      .filter((repo) => {
        const homepage = String(repo.homepage ?? '').toLowerCase();
        const haystack = normalizeText(`${repo.full_name ?? ''} ${repo.description ?? ''}`).replace(/\s+/g, '');
        return homepage.includes(domain) || haystack.includes(normalizedName) || haystack.includes(normalizeText(domainToken));
      })
      .slice(0, 5)
      .map((repo) => ({
        fullName: repo.full_name ?? '',
        url: repo.html_url ?? '',
        description: repo.description ?? '',
        homepage: repo.homepage ?? '',
        pushedAt: repo.pushed_at ?? null,
        updatedAt: repo.updated_at ?? null,
        stars: repo.stargazers_count ?? 0,
        forks: repo.forks_count ?? 0,
        archived: Boolean(repo.archived),
      }));

    const activeRepositories = repositories.filter((repo) => !repo.archived);
    const latestPush = activeRepositories
      .map((repo) => repo.pushedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const recentCutoff = Date.now() - (180 * 24 * 60 * 60 * 1_000);
    const hasRecentActivity = latestPush ? Date.parse(latestPush) >= recentCutoff : false;
    const evidenceUrl = activeRepositories[0]?.url || endpoint.toString();

    return {
      code,
      status: 'real',
      sourceUrl: endpoint.toString(),
      title: `GitHub public footprint · ${company.tradeName}`,
      summary: activeRepositories.length
        ? `${activeRepositories.length} repositórios públicos correlacionados; atividade recente: ${hasRecentActivity ? 'sim' : 'não'}.`
        : 'Nenhum repositório público com correlação suficiente foi identificado.',
      confidenceScore: activeRepositories.length ? 0.76 : 0.58,
      payload: {
        query: domainToken,
        repositoryCount: activeRepositories.length,
        latestPush,
        hasRecentActivity,
        repositories,
        authenticated: Boolean(token),
      },
      ...(activeRepositories.length ? {
        signal: {
          type: 'technical_product_signal',
          strength: hasRecentActivity ? 76 : 70,
          confidenceScore: hasRecentActivity ? 0.76 : 0.69,
          note: `${activeRepositories.length} repositórios públicos correlacionados ao domínio; ${hasRecentActivity ? 'há atividade nos últimos 180 dias' : 'sem atividade recente confirmada'}.`,
          evidenceUrl,
        },
      } : {}),
    };
  } catch (error) {
    return partialRun(code, endpoint.toString(), `GitHub public footprint · ${company.tradeName}`, error);
  }
}

const buildOutput = (company: CompanySeed, run: DirectSourceRun, collectedAt: string, sourceId: string): MonitoringOutput => ({
  id: crypto.randomUUID(),
  companyId: company.id,
  sourceId,
  title: run.title,
  summary: run.summary,
  collectedAt,
  confidenceScore: run.confidenceScore,
  connectorStatus: run.status,
  normalizedPayload: {
    ...run.payload,
    sourceCode: run.code,
    sourceUrl: run.sourceUrl,
    timestamp: collectedAt,
    confidenceScore: run.confidenceScore,
    accessMode: 'public_free',
  },
});

const buildSignal = (company: CompanySeed, run: DirectSourceRun, collectedAt: string, sourceId: string): CompanySignal | null => {
  if (!run.signal) return null;
  return {
    id: crypto.randomUUID(),
    companyId: company.id,
    sourceId,
    signalType: run.signal.type,
    signalStrength: run.signal.strength,
    confidenceScore: run.signal.confidenceScore,
    evidencePayload: {
      note: run.signal.note,
      sourceCode: run.code,
      sourceUrl: run.signal.evidenceUrl,
      timestamp: collectedAt,
      confidenceScore: run.signal.confidenceScore,
      observedFact: true,
    },
    observedVsInferred: 'observed',
    createdAt: collectedAt,
  };
};

export async function ingestFreeOfficialCompanySources(
  company: CompanySeed,
  sources: SourceCatalogEntry[],
  collectedAt = new Date().toISOString(),
) {
  const enabled = enabledSourceCodes(sources);
  const sourceIdByCode = new Map(sources.map((source) => [sourceCode(source), source.id]));
  const runners: Array<Promise<DirectSourceRun>> = [];

  if (enabled.has('src_wayback_company_history')) runners.push(runWayback(company));
  if (enabled.has('src_common_crawl_company_history')) runners.push(runCommonCrawl(company));
  if (enabled.has('src_github_public_api')) runners.push(runGitHub(company));

  const runs = await Promise.all(runners);
  const signals = runs
    .map((run) => buildSignal(company, run, collectedAt, sourceIdByCode.get(run.code) ?? run.code))
    .filter((signal): signal is CompanySignal => Boolean(signal));

  return {
    outputs: runs.map((run) => buildOutput(company, run, collectedAt, sourceIdByCode.get(run.code) ?? run.code)),
    signals,
    enrichments: [] as never[],
  };
}
