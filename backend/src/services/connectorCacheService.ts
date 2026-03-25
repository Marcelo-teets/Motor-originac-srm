import { createHash } from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase.js';

const hashPayload = (payload: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

export class ConnectorCacheService {
  private readonly client = getSupabaseClient();

  async get(sourceEndpointId: string, cacheKey: string) {
    if (!this.client) return null;
    const rows = await this.client.select('connector_payload_cache', {
      select: '*',
      limit: 1,
      filters: [
        { column: 'source_endpoint_id', operator: 'eq', value: sourceEndpointId },
        { column: 'cache_key', operator: 'eq', value: cacheKey },
      ],
    }).catch(() => []);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async set(sourceEndpointId: string, cacheKey: string, payload: Record<string, unknown>, ttlHours = 24) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
    const row = {
      source_endpoint_id: sourceEndpointId,
      cache_key: cacheKey,
      payload,
      payload_hash: hashPayload(payload),
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    };
    if (!this.client) return { ...row, id: `cache_${Date.now()}` };
    const [saved] = await this.client.upsert('connector_payload_cache', [row], 'source_endpoint_id,cache_key');
    return saved;
  }
}
