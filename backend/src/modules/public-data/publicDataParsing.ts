import { createHash } from 'node:crypto';

/**
 * Parsing/fetch helpers shared by the public bulk and strategic public-data
 * connectors (they used to keep diverging copies of each one).
 */

export const normalizeHeader = (value: string) => value
  .replace(/^\uFEFF/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

export const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Brazilian ("R$ 1.234,56") and plain ("1234.56") amounts; null when not numeric. */
export const parseNumber = (value: unknown) => {
  const text = clean(value);
  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
    : text.replace(/[^0-9.-]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

/** YYYYMMDD, DD/MM/YYYY, DD-MM-YYYY or ISO prefixes to YYYY-MM-DD. */
export const parseDate = (value: unknown) => {
  const text = clean(value);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const br = text.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
};

export const pick = (row: Record<string, string>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value !== undefined && clean(value)) return clean(value);
  }
  return '';
};

export const rowObject = (headers: string[], values: string[]) => Object.fromEntries(
  headers.map((header, index) => [normalizeHeader(header), clean(values[index] ?? '')]),
);

/** Full CNPJs match exactly or by root; 8-digit roots match by root. */
export const targetMatch = (cnpj: string, targets: Set<string>, roots: Set<string>) => (cnpj.length === 14
  ? targets.has(cnpj) || roots.has(cnpj.slice(0, 8))
  : roots.has(cnpj.slice(0, 8)));

export const linksFromHtml = (html: string, base: string) => [...html.matchAll(/href=["']([^"']+)["']/gi)]
  .map((match) => {
    try {
      return new URL(match[1], base).toString();
    } catch {
      return null;
    }
  })
  .filter((value): value is string => Boolean(value));

/** Discovery page fetch, bounded so a stalled portal cannot hang the run. */
export const fetchText = async (url: string) => {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'OriginationIntelligencePlatform/1.0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Discovery failed: ${response.status} ${url}`);
  return response.text();
};
