export const normalizeUrl = (value: string) => value.trim().replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();

export const dedupeUrls = (values: string[]) => Array.from(new Set(values.map(normalizeUrl)));
