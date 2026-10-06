import type { IncomingMessage } from 'node:http';

const httpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

/**
 * Reads a JSON object request body with a hard size cap. An empty body yields
 * `{}`; oversize bodies fail with 413 and malformed or non-object JSON with 400.
 */
export const readJsonObjectBody = async (req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw httpError(`Request body exceeds ${Math.round(maxBytes / 1_000)} KB.`, 413);
    chunks.push(buffer);
  }
  if (!chunks.length) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError('Request body is not valid JSON.', 400);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw httpError('JSON body must be an object.', 400);
  }
  return parsed as Record<string, unknown>;
};
