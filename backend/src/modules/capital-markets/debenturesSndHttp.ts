import { fetchCvmWithRetry } from './cvmHttp.js';
import { parseDebenturesSndExport } from './debenturesSndParser.js';
import type { DebenturesSndSnapshot } from './debenturesSndTypes.js';

const ALLOWED_HOST = 'www.debentures.com.br';

export const fetchDebenturesSndSnapshot = async (sourceUrl: string): Promise<DebenturesSndSnapshot> => {
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname !== ALLOWED_HOST) {
    throw new Error('Debentures SND connector rejected a non-allowlisted source URL.');
  }
  const response = await fetchCvmWithRetry(parsed.toString(), {
    headers: { accept: 'application/vnd.ms-excel,text/plain' },
  }, { label: 'Debentures SND allowlisted export' });
  if (!response.ok) throw new Error(`Debentures SND export failed with HTTP ${response.status}.`);
  const payload = new Uint8Array(await response.arrayBuffer());
  if (payload.byteLength < 1_000) throw new Error(`Debentures SND export unexpectedly small: ${payload.byteLength} bytes.`);
  return parseDebenturesSndExport(payload);
};
