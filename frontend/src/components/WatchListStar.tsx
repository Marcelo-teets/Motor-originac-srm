import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { watchlistApi } from '../lib/watchlistApi';
import type { WatchList } from '../lib/watchlistTypes';

type Props = {
  companyId: string;
  companyName?: string;
};

export function WatchListStar({ companyId, companyName }: Props) {
  const { session } = useAuth();
  const [lists, setLists] = useState<WatchList[]>([]);
  const [inLists, setInLists] = useState<WatchList[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [allLists, companyLists] = await Promise.all([
          watchlistApi.listWatchLists(session),
          watchlistApi.getCompanyWatchLists(session, companyId),
        ]);
        if (!active) return;
        setLists(allLists.data);
        setInLists(companyLists);
      } catch {
        if (!active) return;
        setLists([]);
        setInLists([]);
      }
    };
    void load();
    return () => { active = false; };
  }, [session?.access_token, companyId]);

  const toggle = async (watchList: WatchList) => {
    setLoading(true);
    try {
      const active = inLists.some((item) => item.id === watchList.id);
      if (active) {
        await watchlistApi.removeFromWatchList(session, watchList.id, companyId);
        setInLists((prev) => prev.filter((item) => item.id !== watchList.id));
      } else {
        await watchlistApi.addToWatchList(session, watchList.id, companyId);
        setInLists((prev) => [...prev, watchList]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = prompt('Nome da nova watch list para ' + (companyName ?? companyId));
    if (!name?.trim()) return;
    setLoading(true);
    try {
      const created = await watchlistApi.createWatchList(session, { name: name.trim() });
      await watchlistApi.addToWatchList(session, created.id, companyId);
      setLists((prev) => [created, ...prev]);
      setInLists((prev) => [created, ...prev]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const isSaved = inLists.length > 0;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" className={isSaved ? '' : 'secondary'} onClick={() => setOpen((prev) => !prev)} disabled={loading} title={isSaved ? 'Salvar em watch lists' : 'Adicionar à watch list'}>
        {isSaved ? '★ Salvo' : '☆ Salvar'}
      </button>
      {open ? (
        <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 20, minWidth: 220, padding: 12, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--panel)', boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
          <div className="table-helper" style={{ marginBottom: 8 }}>Watch Lists</div>
          {lists.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {lists.map((watchList) => {
                const active = inLists.some((item) => item.id === watchList.id);
                return (
                  <li key={watchList.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', cursor: 'pointer' }} onClick={() => void toggle(watchList)}>
                    <span>{active ? '★' : '☆'}</span>
                    <span>{watchList.name}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="table-helper">Nenhuma watch list criada.</p>
          )}
          <button type="button" className="secondary" style={{ width: '100%', marginTop: 10 }} onClick={() => void handleCreate()}>+ Nova watch list</button>
        </div>
      ) : null}
    </div>
  );
}
