import { Link } from 'react-router-dom';
import { Card, Pill } from './UI';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';
import { watchlistApi } from '../lib/watchlistApi';

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return 'agora';
  if (minutes < 60) return String(minutes) + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return String(hours) + 'h';
  return String(Math.floor(hours / 24)) + 'd';
}

export function WatchListWidget() {
  const { session } = useAuth();
  const { data: listsState } = useAsyncData(() => watchlistApi.listWatchLists(session), [session?.access_token]);
  const lists = listsState?.data ?? [];
  const totalItems = lists.reduce((sum, item) => sum + (item.itemCount ?? 0), 0);
  const firstListId = lists[0]?.id;
  const { data: updates } = useAsyncData(async () => firstListId ? watchlistApi.getWatchListUpdates(session, firstListId) : [], [session?.access_token, firstListId]);

  return (
    <Card title="Watch List" subtitle={String(lists.length) + ' listas e ' + String(totalItems) + ' empresas'} actions={<Link to="/watch-lists"><Pill tone="info">abrir</Pill></Link>}>
      {!lists.length ? (
        <div>
          <p className="table-helper">Nenhuma watch list criada ainda.</p>
          <Link to="/watch-lists">Criar primeira lista</Link>
        </div>
      ) : (
        <>
          <ul className="list compact-list">
            {lists.slice(0, 3).map((item) => (
              <li key={item.id}><strong>{item.name}</strong><span>{item.itemCount ?? 0} empresas</span></li>
            ))}
          </ul>
          {updates?.length ? (
            <ul className="list compact-list">
              {updates.slice(0, 4).map((update, index) => (
                <li key={update.companyId + '-' + String(index)}>
                  <div><strong>{update.companyName}</strong><div className="table-helper">{update.summary}</div></div>
                  <span>{ago(update.observedAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Card>
  );
}
