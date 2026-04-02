import { buildDocumentFingerprint } from './documentFingerprint.js';
import { normalizeUrl } from './urlNormalization.js';

export const normalizeFeedItem = (item: { title?: string; link?: string; description?: string; publishedAt?: string }) => ({
  title: (item.title ?? '').trim(),
  link: normalizeUrl(item.link ?? ''),
  description: (item.description ?? '').trim(),
  publishedAt: item.publishedAt ?? new Date().toUTCString(),
});

export const buildFeedItemFingerprint = (item: { title?: string; link?: string; description?: string }) =>
  buildDocumentFingerprint([item.title ?? '', normalizeUrl(item.link ?? ''), item.description ?? '']);

export const dedupeFeedItems = <T extends { title?: string; link?: string; description?: string }>(items: T[]) =>
  items.filter((item, index, array) => {
    const fingerprint = buildFeedItemFingerprint(item);
    return array.findIndex((candidate) => buildFeedItemFingerprint(candidate) === fingerprint) === index;
  });
