/**
 * Returns the URL only when it is an absolute http(s) link. Source URLs come
 * from scraped third-party data, so anything else (javascript:, data:, relative
 * paths) is dropped instead of being rendered as a clickable link.
 */
export const safeExternalUrl = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};
