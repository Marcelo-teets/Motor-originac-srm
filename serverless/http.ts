import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** Shared request helpers for the Vercel functions in api/ and serverless/. */

export const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

type HeaderSource = { headers: Record<string, string | string[] | undefined> };

export const getHeader = (req: HeaderSource, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

export const parseRequestUrl = (req: HeaderSource & { url?: string }) => {
  const host = getHeader(req, 'host') ?? 'localhost';
  return new URL(req.url ?? '/', `https://${host}`);
};

/** Constant-time string comparison (length is the only leaked property). */
export const safeEqual = (received: string, expected: string) => {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Vercel Cron / GitHub Actions authorization. Fail-closed when CRON_SECRET is
 * not configured and compare in constant time so the secret cannot be probed
 * byte by byte through response timing.
 */
export const isCronAuthorized = (req: HeaderSource) => {
  const secret = process.env.CRON_SECRET ?? '';
  return Boolean(secret) && safeEqual(getHeader(req, 'authorization') ?? '', `Bearer ${secret}`);
};

export const readJsonBody = async (req: IncomingMessage, maxBytes = 64_000): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) {
      throw Object.assign(new Error(`Request body exceeds ${Math.round(maxBytes / 1000)} KB.`), { statusCode: 413 });
    }
    chunks.push(buffer);
  }
  if (!bytes) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw Object.assign(new Error('JSON body must be an object.'), { statusCode: 400 });
  }
  return parsed as Record<string, unknown>;
};
