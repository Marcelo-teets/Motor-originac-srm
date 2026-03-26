import { buildMvpPersistenceSeedExample } from './mvpPersistenceSeedExample.js';
import { MvpPersistenceBootstrapService } from './mvpPersistenceBootstrapService.js';

type SupabaseLikeClient = {
  upsert: (table: string, rows: unknown[], onConflict?: string) => Promise<unknown>;
  insert: (table: string, rows: unknown[]) => Promise<unknown>;
};

export async function runMvpPersistenceSeedExample(client: SupabaseLikeClient) {
  const payload = buildMvpPersistenceSeedExample();
  const service = new MvpPersistenceBootstrapService(client);
  return service.persistAll(payload);
}
