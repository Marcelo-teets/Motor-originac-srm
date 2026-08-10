import { getSupabaseClient } from './supabase.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';

export type PublisherCatalogEntry = {
  code: string;
  name: string;
  domain?: string;
};

export type PublisherAttributionResult = {
  hits: DiscoverySourceHit[];
  attributed: number;
  unresolved: number;
  catalogLoaded: boolean;
};

const normalizeText = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const canonicalPublisherName = (value: string) => normalizeText(value)
  .split(' ')
  .filter((token) => !new Set(['rss', 'news', 'business', 'br', 'brasil']).has(token))
  .join(' ')
  .trim();

export const extractPublisherNameFromHit = (hit: DiscoverySourceHit) => {
  const explicit = typeof hit.rawPayload.publisherName === 'string'
    ? hit.rawPayload.publisherName.trim()
    : '';
  if (explicit) return explicit;

  const title = typeof hit.rawPayload.title === 'string'
    ? hit.rawPayload.title.replace(/\s+/g, ' ').trim()
    : '';
  if (!title) return '';

  const separator = title.lastIndexOf(' - ');
  if (separator < 0 || separator >= title.length - 3) return '';
  return title.slice(separator + 3).trim();
};

const mapCatalogRow = (row: any): PublisherCatalogEntry | null => {
  const metadata = row?.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {};
  const code = String(metadata.code ?? '').trim();
  const name = String(row?.name ?? '').trim();
  const status = normalizeText(row?.status);
  const health = normalizeText(row?.health);
  const domain = String(metadata.domain ?? '').trim();

  if (!code || !name || health !== 'healthy' || !['real', 'active'].includes(status)) return null;
  return { code, name, ...(domain ? { domain } : {}) };
};

export const attributePublisherFromCatalog = (
  hit: DiscoverySourceHit,
  catalog: PublisherCatalogEntry[],
): { hit: DiscoverySourceHit; matched: boolean; publisherName: string } => {
  const publisherName = extractPublisherNameFromHit(hit);
  if (!publisherName) return { hit, matched: false, publisherName: '' };

  const canonicalPublisher = canonicalPublisherName(publisherName);
  const match = catalog.find((source) => canonicalPublisherName(source.name) === canonicalPublisher);

  if (!match) {
    return {
      hit: {
        ...hit,
        rawPayload: {
          ...hit.rawPayload,
          publisherName,
          publisherAttribution: {
            version: 'v11',
            matched: false,
            method: 'publisher_name_not_in_governed_catalog',
            transportSourceRef: hit.rawPayload.transportSourceRef ?? hit.sourceRef,
          },
        },
      },
      matched: false,
      publisherName,
    };
  }

  const originalSourceRef = hit.sourceRef;
  const shouldPromoteSource = originalSourceRef === 'google-news-rss' || originalSourceRef === 'supabase-discovery-universe';
  return {
    hit: {
      ...hit,
      sourceRef: shouldPromoteSource ? match.code : originalSourceRef,
      rawPayload: {
        ...hit.rawPayload,
        publisherName,
        publisherAttribution: {
          version: 'v11',
          matched: true,
          method: 'catalog_publisher_name_exact',
          catalogSourceRef: match.code,
          catalogSourceName: match.name,
          catalogSourceDomain: match.domain ?? null,
          originalSourceRef,
          transportSourceRef: hit.rawPayload.transportSourceRef ?? (originalSourceRef === 'google-news-rss' ? 'google-news-rss' : null),
        },
        ...(originalSourceRef === 'google-news-rss'
          ? { transportSourceRef: hit.rawPayload.transportSourceRef ?? 'google-news-rss' }
          : {}),
      },
    },
    matched: true,
    publisherName,
  };
};

export async function attributeDiscoveryPublishers(
  hits: DiscoverySourceHit[],
): Promise<PublisherAttributionResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { hits, attributed: 0, unresolved: 0, catalogLoaded: false };
  }

  let catalog: PublisherCatalogEntry[] = [];
  try {
    const rows = await client.select('source_catalog', {
      select: 'name,status,health,metadata',
      limit: 200,
    });
    catalog = (rows ?? [])
      .map(mapCatalogRow)
      .filter((item): item is PublisherCatalogEntry => Boolean(item));
  } catch {
    return { hits, attributed: 0, unresolved: 0, catalogLoaded: false };
  }

  let attributed = 0;
  let unresolved = 0;
  const attributedHits = hits.map((hit) => {
    const result = attributePublisherFromCatalog(hit, catalog);
    if (result.matched) attributed += 1;
    else if (result.publisherName) unresolved += 1;
    return result.hit;
  });

  return {
    hits: attributedHits,
    attributed,
    unresolved,
    catalogLoaded: true,
  };
}
