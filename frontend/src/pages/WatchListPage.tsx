import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataStatusBanner, PageIntro, Pill } from '../components/UI';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';
import { api } from '../lib/api';
import { watchlistApi } from '../lib/watchlistApi';
import type { WatchList, WatchListItem, WatchListUpdate } from '../lib/watchlistTypes';

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return 'agora';
  if (minutes < 60) return String(minutes) + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return String(hours) + 'h';
  return String(Math.floor(hours / 24)) + 'd';
}

export function WatchListPage() {
  const { session } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const { data: listsState, loading: loadingLists, setData: setListsState } = useAsyncData(() => watchlistApi.listWatchLists(session), [session?.access_token]);
  const lists = listsState?.data ?? [];

  useEffect(() => {
    if (!activeId && lists.length) setActiveId(lists[0].id);
  }, [activeId, lists]);

  const { data: items, loading: loadingItems, setData: setItems } = useAsyncData(async () => {
    if (!activeId) return [] as WatchListItem[];
    const watchItems = await watchlistApi.listWatchListItems(session, activeId);
    const companies = (await api.getCompanies(session)).data;
    return watchItems.map((item) => {
      const company = companies.find((entry) => entry.id === item.companyId);
      return {
        ...item,
        companyName: company?.name ?? item.companyName ?? item.companyId,
        qualificationScore: company?.qualificationScore,
        leadScore: company?.leadScore,
        suggestedStructure: company?.suggestedStructure,
        topPattern: company?.topPatterns?.[0],
        triggerStrength: company?.triggerStrength,
      };
    });
  }, [session?.access_token, activeId]);

  const { data: updates } = useAsyncData(async () => activeId ? watchlistApi.getWatchListUpdates(session, activeId) : [] as WatchListUpdate[], [session?.access_token, activeId]);

  const reloadLists = async () => setListsState(await watchlistApi.listWatchLists(session));

  const handleCreate = async () => {
    const name = prompt('Nome da watch list');
    if (!name?.trim()) return;
    await watchlistApi.createWatchList(session, { name: name.trim() });
    await reloadLists();
    setFeedback('Watch list criada com sucesso.');
  };

  const handleDelete = async (watchList: WatchList) => {
    if (!confirm('Remover a watch list ' + watchList.name + '?')) return;
    await watchlistApi.deleteWatchList(session, watchList.id);
    if (activeId === watchList.id) setActiveId(null);
    await reloadLists();
    setFeedback('Watch list removida.');
  };

  const handleRename = async (watchList: WatchList) => {
    const nextName = prompt('Novo nome da watch list', watchList.name);
    if (!nextName?.trim()) return;
    await watchlistApi.updateWatchList(session, watchList.id, { name: nextName.trim() });
    await reloadLists();
    setFeedback('Watch list atualizada.');
  };

  const handleRemove = async (item: WatchListItem) => {
    if (!activeId) return;
    await watchlistApi.removeFromWatchList(session, activeId, item.companyId);
    setItems((prev) => (prev ?? []).filter((entry) => entry.id !== item.id));
    await reloadLists();
    setFeedback('Empresa removida da watch list.');
  };

  if (loadingLists) return <div className="page"><Card title="Watch Lists" subtitle="Carregando listas de observação">Aguarde...</Card></div>;

  return (
    <div className="page">
      <PageIntro eyebrow="Watch List" title="Observação ativa de empresas" description="Camada operacional entre ranking e pipeline para acompanhar sinais, mudanças e timing de funding." actions={<button type="button" onClick={() => void handleCreate()}>+ Nova watch list</button>} />
      {listsState ? <DataStatusBanner source={listsState.source} note={listsState.note} /> : null}
      {feedback ? <div className="table-helper">{feedback}</div> : null}
      <section className="grid cols-2 detail-layout" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Card title="Minhas listas" subtitle={String(lists.length) + ' lista(s)'} className="dense-card">
            {!lists.length ? <p className="table-helper">Nenhuma watch list criada ainda.</p> : (
              <ul className="list">
                {lists.map((watchList) => (
                  <li key={watchList.id} style={{ cursor: 'pointer' }} onClick={() => setActiveId(watchList.id)}>
                    <div>
                      <strong>{watchList.name}</strong>
                      <div className="table-helper">{watchList.itemCount ?? 0} empresa(s)</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="secondary" onClick={(event) => { event.stopPropagation(); void handleRename(watchList); }}>Renomear</button>
                      <button type="button" className="secondary" onClick={(event) => { event.stopPropagation(); void handleDelete(watchList); }}>Excluir</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Feed de mudanças" subtitle="Sinais recentes das empresas observadas" className="dense-card">
            {!updates?.length ? <p className="table-helper">Nenhuma mudança recente detectada.</p> : (
              <ul className="list compact-list">
                {updates.slice(0, 8).map((update, index) => (
                  <li key={update.companyId + '-' + String(index)}>
                    <div><strong>{update.companyName}</strong><div className="table-helper">{update.summary}</div></div>
                    <span>{ago(update.observedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title={lists.find((item) => item.id === activeId)?.name ?? 'Selecione uma lista'} subtitle="Empresas monitoradas" actions={<Pill tone="success">{(items ?? []).length} itens</Pill>} className="dense-card">
          {loadingItems ? <p className="table-helper">Carregando empresas...</p> : !(items ?? []).length ? <p className="table-helper">Nenhuma empresa nesta lista ainda.</p> : (
            <table className="dense-table">
              <thead>
                <tr><th>Empresa</th><th>Scores</th><th>Estrutura</th><th>Pattern</th><th>Trigger</th><th>Adicionado</th><th></th></tr>
              </thead>
              <tbody>
                {(items ?? []).map((item: any) => (
                  <tr key={item.id}>
                    <td><Link to={'/companies/' + item.companyId}><strong>{item.companyName}</strong></Link></td>
                    <td>{item.qualificationScore ?? '-'} / {item.leadScore ?? '-'}</td>
                    <td>{item.suggestedStructure ?? '-'}</td>
                    <td>{item.topPattern ?? '-'}</td>
                    <td>{item.triggerStrength ?? '-'}</td>
                    <td>{ago(item.addedAt)}</td>
                    <td><button type="button" className="secondary" onClick={() => void handleRemove(item)}>Remover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}
