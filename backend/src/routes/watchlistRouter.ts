import { Router } from 'express';
import { getSupabaseClient } from '../lib/supabase.js';

type WatchList = {
  id: string;
  createdBy?: string;
  name: string;
  description?: string;
  isShared: boolean;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
};

type WatchListItem = {
  id: string;
  watchlistId: string;
  companyId: string;
  companyName?: string;
  addedBy?: string;
  priorityLabel?: string;
  notes?: string;
  addedAt: string;
};

const ok = (data: unknown) => ({ status: 'real' as const, generatedAt: new Date().toISOString(), data });
const fail = (code: number, error: string) => ({ statusCode: code, error });
const p = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

const withClientFallback = async <T>(
  operation: (client: NonNullable<ReturnType<typeof getSupabaseClient>>) => Promise<T>,
  fallback: () => Promise<T> | T,
): Promise<T> => {
  const client = getSupabaseClient();
  if (!client) return await fallback();
  try {
    return await operation(client);
  } catch {
    return await fallback();
  }
};

const memory = {
  watchlists: [] as WatchList[],
  items: [] as WatchListItem[],
};

const mapWatchList = (row: any, itemCount = 0): WatchList => ({
  id: row.id,
  createdBy: row.created_by ?? undefined,
  name: row.name,
  description: row.description ?? undefined,
  isShared: Boolean(row.is_shared),
  itemCount,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapWatchListItem = (row: any): WatchListItem => ({
  id: row.id,
  watchlistId: row.watchlist_id,
  companyId: row.company_id,
  companyName: row.company_name ?? undefined,
  addedBy: row.added_by ?? undefined,
  priorityLabel: row.priority_label ?? undefined,
  notes: row.notes ?? undefined,
  addedAt: row.added_at,
});

export const createWatchlistRouter = (repository: any) => {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const lists = await withClientFallback(async (client) => {
        const [rows, items] = await Promise.all([
          client.select('watchlists', { select: '*', orderBy: { column: 'created_at', ascending: false } }),
          client.select('watchlist_items', { select: 'watchlist_id' }),
        ]);
        const counts = new Map<string, number>();
        (items ?? []).forEach((row: any) => counts.set(row.watchlist_id, (counts.get(row.watchlist_id) ?? 0) + 1));
        return (rows ?? []).map((row: any) => mapWatchList(row, counts.get(row.id) ?? 0));
      }, () => memory.watchlists.map((wl) => ({ ...wl, itemCount: memory.items.filter((item) => item.watchlistId === wl.id).length })));
      res.json(ok(lists));
    } catch (error) {
      res.status(500).json(fail(500, error instanceof Error ? error.message : 'Erro ao listar watch lists.'));
    }
  });

  router.post('/', async (req, res) => {
    try {
      const userId = (req as any).authUser?.id;
      const name = String(req.body?.name ?? '').trim();
      const description = String(req.body?.description ?? '').trim();
      const isShared = Boolean(req.body?.isShared);
      if (!name) return res.status(400).json(fail(400, 'name é obrigatório'));

      const created = await withClientFallback(async (client) => {
        const now = new Date().toISOString();
        let inserted: any[] = [];
        try {
          inserted = await client.insert('watchlists', [{ name, description: description || null, is_shared: isShared, created_by: userId ?? null, created_at: now, updated_at: now }]);
        } catch {
          inserted = await client.insert('watchlists', [{ name, description: description || null, is_shared: isShared, created_by: null, created_at: now, updated_at: now }]);
        }
        return mapWatchList(inserted[0], 0);
      }, () => {
        const now = new Date().toISOString();
        const watchList: WatchList = {
          id: crypto.randomUUID(),
          createdBy: userId,
          name,
          description: description || undefined,
          isShared,
          itemCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        memory.watchlists.unshift(watchList);
        return watchList;
      });
      res.status(201).json(ok(created));
    } catch (error) {
      res.status(500).json(fail(500, error instanceof Error ? error.message : 'Erro ao criar watch list.'));
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const id = p(req.params.id);
      const patch: Record<string, unknown> = {
        ...(req.body?.name !== undefined ? { name: String(req.body.name).trim() } : {}),
        ...(req.body?.description !== undefined ? { description: String(req.body.description).trim() || null } : {}),
        ...(req.body?.isShared !== undefined ? { is_shared: Boolean(req.body.isShared) } : {}),
        updated_at: new Date().toISOString(),
      };

      const client = getSupabaseClient();
      if (!client) {
        const index = memory.watchlists.findIndex((item) => item.id === id);
        if (index < 0) return res.status(404).json(fail(404, 'Watch list não encontrada.'));
        memory.watchlists[index] = {
          ...memory.watchlists[index],
          ...(req.body?.name !== undefined ? { name: String(req.body.name).trim() } : {}),
          ...(req.body?.description !== undefined ? { description: String(req.body.description).trim() || undefined } : {}),
          ...(req.body?.isShared !== undefined ? { isShared: Boolean(req.body.isShared) } : {}),
          updatedAt: new Date().toISOString(),
        };
        return res.json(ok(memory.watchlists[index]));
      }

      const rows = await client.update('watchlists', patch, [{ column: 'id', operator: 'eq', value: id }]);
      if (!rows?.length) return res.status(404).json(fail(404, 'Watch list não encontrada.'));
      const itemCount = (await client.select('watchlist_items', { select: 'id', filters: [{ column: 'watchlist_id', operator: 'eq', value: id }] }))?.length ?? 0;
      res.json(ok(mapWatchList(rows[0], itemCount)));
    } catch (error) {
      res.status(500).json(fail(500, error instanceof Error ? error.message : 'Erro ao atualizar watch list.'));
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const id = p(req.params.id);
      const client = getSupabaseClient();
      if (!client) {
        const before = memory.watchlists.length;
        memory.watchlists = memory.watchlists.filter((item) => item.id !== id);
        memory.items = memory.items.filter((item) => item.watchlistId !== id);
        if (memory.watchlists.length === before) return res.status(404).json(fail(404, 'Watch list não encontrada.'));
        return res.json(ok({ deleted: true }));
      }
      await client.delete('watchlists', [{ column: 'id', operator: 'eq', value: id }]);
      res.json(ok({ deleted: true }));
    } catch (error) {
      res.status(500).json(fail(500, error instanceof Error ? error.message : 'Erro ao remover watch list.'));
    }
  });

  router.get('/company/:companyId', async (req, res) => {
    try {
      const companyId = p(req.params.companyId);
      const companyLists = await withClientFallback(async (client) => {
        const links = await client.select('watchlist_items', { select: 'watchlist_id', filters: [{ column: 'company_id', operator: 'eq', value: companyId }] });
        const ids = [...new Set((links ?? []).map((row: any) => row.watchlist_id))];
        if (!ids.length) return [] as WatchList[];
        const rows = await client.select('watchlists', { select: '*', filters: [{ column: 'id', operator: 'in', value: ids }] });
        return (rows ?? []).map((row: any) => mapWatchList(row));
      }, () => {
        const watchlistIds = new Set(memory.items.filter((item) => item.companyId === companyId).map((item) => item.watchlistId));
        return memory.watchlists.filter((item) => watchlistIds.has(item.id));
      });
      res.json(ok(companyLists));
    } catch (error) {
      res.status(500).json(fail(500, error instanceof Error ? error.message : 'Erro ao listar listas da empresa.'));
    }
  });

  router.get('/:id/items', async (req, res) => {
    try {
      const watchlistId = p(req.params.id);
      const companies = await repository.listCompanies();
      const companyNames = new Map((companies ?? []).map((company: any) => [company.id, company.tradeName ?? company.name ?? company.id]));
      const listItems = await withClientFallback(async (client) => {
        const rows = await client.select('watchlist_items', { select: '*', filters: [{ column: 'watchlist_id', operator: 'eq', value: watchlistId }], orderBy: { column: 'added_at', ascending: false } });
        return (rows ?? []).map((row: any) => ({ ...mapWatchListItem(row), companyName: companyNames.get(row.company_id) ?? row.company_id }));
      }, () => memory.items.filter((item) => item.watchlistId === watchlistId).map((item) => ({ ...item, companyName: companyNames.get(item.companyId) ?? item.companyId })));
      res.json(ok(listItems));
    } catch (error) {
      res.status(500).json(fail(500, error instanceof Error ? error.message : 'Erro ao listar empresas da watch list.'));
    }
  });

  router.post('/:id/items', async (req, res) => {
    try {
      const watchlistId = p(req.params.id);
      const companyId = String(req.body?.companyId ?? '').trim();
      const priorityLabel = req.body?.priorityLabel ? String(req.body.priorityLabel) : null;
      const notes = req.body?.notes ? String(req.body.notes) : null;
      const userId = (req as any).authUser?.id;
      if (!companyId) return res.status(400).json(fail(400, 'companyId é obrigatório'));

      const createdItem = await withClientFallback(async (client) => {
        const existing = await client.select('watchlist_items', { select: '*', filters: [{ column: 'watchlist_id', operator: 'eq', value: watchlistId }, { column: 'company_id', operator: 'eq', value: companyId }], limit: 1 });
        if (existing?.length) return mapWatchListItem(existing[0]);

        let inserted: any[] = [];
        try {
          inserted = await client.insert('watchlist_items', [{ watchlist_id: watchlistId, company_id: companyId, added_by: userId ?? null, priority_label: priorityLabel, notes }]);
        } catch {
          inserted = await client.insert('watchlist_items', [{ watchlist_id: watchlistId, company_id: companyId, added_by: null, priority_label: priorityLabel, notes }]);
        }
        return mapWatchListItem(inserted[0]);
      }, () => {
        const existing = memory.items.find((item) => item.watchlistId === watchlistId && item.companyId === companyId);
        if (existing) return existing;
        const item: WatchListItem = { id: crypto.randomUUID(), watchlistId, companyId, addedBy: userId, priorityLabel: priorityLabel ?? undefined, notes: notes ?? undefined, addedAt: new Date().toISOString() };
        memory.items.unshift(item);
        return item;
      });
      res.status(201).json(ok(createdItem));
    } catch (error) {
      res.status(500).json(fail(500, error instanceof Error ? error.message : 'Erro ao adicionar empresa na watch list.'));
    }
  });

  router.delete('/:id/items/:companyId', async (req, res) => {
    try {
      const watchlistId = p(req.params.id);
      const companyId = p(req.params.companyId);
      await withClientFallback(async (client) => {
        await client.delete('watchlist_items', [{ column: 'watchlist_id', operator: 'eq', value: watchlistId }, { column: 'company_id', operator: 'eq', value: companyId }]);
      }, () => {
        const before = memory.items.length;
        memory.items = memory.items.filter((item) => !(item.watchlistId === watchlistId && item.companyId === companyId));
        if (memory.items.length === before) throw new Error('Item não encontrado.');
      });
      res.json(ok({ removed: true }));
    } catch (error) {
      res.status(500).json(fail(500, error instanceof Error ? error.message : 'Erro ao remover empresa da watch list.'));
    }
  });

  router.get('/:id/updates', async (req, res) => {
    try {
      const watchlistId = p(req.params.id);
      const items = await withClientFallback(async (client) => {
        const rows = await client.select('watchlist_items', { select: '*', filters: [{ column: 'watchlist_id', operator: 'eq', value: watchlistId }] });
        return (rows ?? []).map((row: any) => mapWatchListItem(row));
      }, () => memory.items.filter((item) => item.watchlistId === watchlistId));

      const companyIds = new Set(items.map((item) => item.companyId));
      const [signals, scores, companies] = await Promise.all([
        repository.listCompanySignals(),
        repository.listLeadScoreSnapshots(),
        repository.listCompanies(),
      ]);

      const names = new Map((companies ?? []).map((company: any) => [company.id, company.tradeName ?? company.name ?? company.id]));
      const latestScore = new Map<string, number>();
      (scores ?? []).forEach((snapshot: any) => {
        if (!latestScore.has(snapshot.companyId)) latestScore.set(snapshot.companyId, snapshot.leadScore);
      });

      const updates = (signals ?? [])
        .filter((signal: any) => companyIds.has(signal.companyId))
        .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 30)
        .map((signal: any) => ({
          watchlistId,
          companyId: signal.companyId,
          companyName: names.get(signal.companyId) ?? signal.companyId,
          updateType: 'new_signal',
          summary: typeof signal.evidencePayload?.note === 'string' ? signal.evidencePayload.note : String(signal.signalType ?? 'new_signal').replace(/_/g, ' '),
          delta: latestScore.get(signal.companyId),
          observedAt: signal.createdAt,
        }));

      res.json(ok(updates));
    } catch (error) {
      res.status(500).json(fail(500, error instanceof Error ? error.message : 'Erro ao gerar feed da watch list.'));
    }
  });

  return router;
};
