import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Pill, Stat } from './UI';
import { useAuth } from '../lib/auth';
import { knowledgeOutcomeSlaApi } from '../lib/knowledgeOutcomeSlaApi';
import type {
  OutcomeSlaItem,
  OutcomeSlaStatus,
  OutcomeSlaWorkspace,
} from '../lib/knowledgeOutcomeSlaTypes';
import '../styles/knowledge-outcome-sla.css';

type Props = {
  companyId?: string;
  companyName?: string;
  refreshToken?: number;
  onChanged?: () => void;
};

type SlaTab = 'mine' | 'unclaimed' | 'breached' | 'dueSoon';

type RescheduleDraft = {
  dueAt: string;
  reason: string;
};

const createKey = (prefix: string, activityId: string) => {
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${activityId}:${token}`;
};

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'não definido';

const formatActivity = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('pt-BR'));

const slaTone = (status: OutcomeSlaStatus) => {
  if (status === 'breached') return 'danger' as const;
  if (status === 'due_soon') return 'warning' as const;
  if (status === 'on_track') return 'success' as const;
  if (status === 'without_sla') return 'info' as const;
  return 'default' as const;
};

const slaLabel: Record<OutcomeSlaStatus, string> = {
  unclaimed: 'sem dono',
  without_sla: 'sem SLA',
  due_soon: 'vence em 24h',
  on_track: 'no prazo',
  breached: 'SLA vencido',
};

const priorityTone = (band: OutcomeSlaItem['priorityBand']) => {
  if (band === 'immediate') return 'danger' as const;
  if (band === 'high') return 'warning' as const;
  if (band === 'review') return 'info' as const;
  return 'default' as const;
};

const priorityLabel: Record<OutcomeSlaItem['priorityBand'], string> = {
  immediate: 'imediata',
  high: 'alta',
  review: 'revisar',
  low: 'baixa',
};

const toIso = (value: string) => value ? new Date(value).toISOString() : '';

export function KnowledgeOutcomeSlaPanel({
  companyId,
  companyName,
  refreshToken = 0,
  onChanged,
}: Props) {
  const { session } = useAuth();
  const [data, setData] = useState<OutcomeSlaWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<SlaTab>('mine');
  const [loading, setLoading] = useState(true);
  const [busyActivityId, setBusyActivityId] = useState<string | null>(null);
  const [rescheduleActivityId, setRescheduleActivityId] = useState<string | null>(null);
  const [rescheduleDraft, setRescheduleDraft] = useState<RescheduleDraft>({ dueAt: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await knowledgeOutcomeSlaApi.getWorkspace(session, companyId, 365);
      setData(loaded);
      return loaded;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar ownership e SLA do Outcome Workbench.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void knowledgeOutcomeSlaApi.getWorkspace(session, companyId, 365)
      .then((loaded) => { if (active) setData(loaded); })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar ownership e SLA do Outcome Workbench.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, refreshToken, session?.access_token]);

  const tabs = useMemo(() => [
    { key: 'mine' as const, label: 'Minha fila', count: data?.summary.myItems ?? 0 },
    { key: 'unclaimed' as const, label: 'Sem dono', count: data?.summary.unassignedItems ?? 0 },
    { key: 'breached' as const, label: 'SLA vencido', count: data?.summary.breachedItems ?? 0 },
    { key: 'dueSoon' as const, label: 'Vence em 24h', count: data?.summary.dueSoonItems ?? 0 },
  ], [data?.summary]);

  const activeItems = useMemo(() => {
    if (!data) return [];
    if (activeTab === 'mine') return data.myQueue;
    if (activeTab === 'unclaimed') return data.unclaimedQueue;
    if (activeTab === 'breached') return data.breachedQueue;
    return data.dueSoonQueue;
  }, [activeTab, data]);

  const mutate = async (activityId: string, operation: () => Promise<unknown>, successMessage: string) => {
    setBusyActivityId(activityId);
    setError(null);
    setNotice(null);
    try {
      await operation();
      await load();
      onChanged?.();
      setNotice(successMessage);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Falha ao atualizar ownership ou SLA.');
    } finally {
      setBusyActivityId(null);
    }
  };

  const claim = (item: OutcomeSlaItem) => mutate(
    item.activityId,
    () => knowledgeOutcomeSlaApi.claim(session, item.activityId, createKey('v9-claim', item.activityId)),
    item.queueSource === 'adoption'
      ? 'Item assumido com instrumentação histórica auditável e SLA criado pela faixa de prioridade.'
      : 'Item assumido e SLA criado pela faixa de prioridade.',
  );

  const release = (item: OutcomeSlaItem) => {
    if (!window.confirm('Liberar este item e remover o SLA pessoal? A atividade permanecerá instrumentada e sem resultado inferido.')) return;
    void mutate(
      item.activityId,
      () => knowledgeOutcomeSlaApi.release(session, item.activityId, createKey('v9-release', item.activityId)),
      'Item liberado. A instrumentação foi preservada e o ownership pessoal foi removido.',
    );
  };

  const beginReschedule = (item: OutcomeSlaItem) => {
    setRescheduleActivityId(item.activityId);
    setRescheduleDraft({
      dueAt: item.slaDueAt ? new Date(item.slaDueAt).toISOString().slice(0, 16) : '',
      reason: '',
    });
    setError(null);
    setNotice(null);
  };

  const submitReschedule = (item: OutcomeSlaItem) => {
    if (!rescheduleDraft.dueAt || rescheduleDraft.reason.trim().length < 5) {
      setError('Informe um novo prazo e uma justificativa com pelo menos 5 caracteres.');
      return;
    }
    void mutate(
      item.activityId,
      () => knowledgeOutcomeSlaApi.reschedule(
        session,
        item.activityId,
        toIso(rescheduleDraft.dueAt),
        rescheduleDraft.reason.trim(),
        createKey('v9-reschedule', item.activityId),
      ),
      'SLA reagendado com justificativa e trilha de auditoria.',
    ).finally(() => {
      setRescheduleActivityId(null);
      setRescheduleDraft({ dueAt: '', reason: '' });
    });
  };

  const renderItem = (item: OutcomeSlaItem) => (
    <article key={`${activeTab}-${item.activityId}`} className={`knowledge-sla-row ${item.slaStatus}`}>
      <div className="knowledge-sla-row-main">
        <div className="pill-row">
          <Pill tone={priorityTone(item.priorityBand)}>prioridade {priorityLabel[item.priorityBand]}</Pill>
          <Pill tone="default">{item.priorityScore}/100</Pill>
          <Pill tone={slaTone(item.slaStatus)}>{slaLabel[item.slaStatus]}</Pill>
          {item.pipelineStage ? <Pill tone="info">{item.pipelineStage}</Pill> : null}
          <Pill tone="default">{formatActivity(item.activityType)}</Pill>
        </div>
        <strong>{item.title}</strong>
        <span>{item.companyName}{item.ownerName ? ` · Origem: ${item.ownerName}` : ''}</span>
        {item.description ? <p>{item.description}</p> : null}
        <div className="knowledge-sla-meta-grid">
          <span><b>Dono</b>{item.taskOwnerDisplayName ?? 'não atribuído'}</span>
          <span><b>Assumido em</b>{formatDate(item.claimedAt)}</span>
          <span><b>SLA</b>{formatDate(item.slaDueAt)}</span>
          <span><b>Tempo restante</b>{item.slaHoursRemaining === null ? '—' : `${item.slaHoursRemaining.toLocaleString('pt-BR')}h`}</span>
        </div>
        {item.priorityReasons.length ? (
          <div className="knowledge-sla-reasons">
            {item.priorityReasons.map((reason) => <span key={reason}>{reason}</span>)}
          </div>
        ) : null}
        {rescheduleActivityId === item.activityId ? (
          <div className="knowledge-sla-reschedule">
            <label>
              <span>Novo SLA</span>
              <input
                type="datetime-local"
                value={rescheduleDraft.dueAt}
                onChange={(event) => setRescheduleDraft({ ...rescheduleDraft, dueAt: event.target.value })}
              />
            </label>
            <label>
              <span>Justificativa</span>
              <input
                value={rescheduleDraft.reason}
                onChange={(event) => setRescheduleDraft({ ...rescheduleDraft, reason: event.target.value })}
                placeholder="Ex.: aguardando retorno do CFO"
              />
            </label>
            <div className="pill-row">
              <button type="button" className="secondary compact-button" onClick={() => setRescheduleActivityId(null)}>Cancelar</button>
              <button type="button" className="compact-button" disabled={busyActivityId === item.activityId} onClick={() => submitReschedule(item)}>
                {busyActivityId === item.activityId ? 'Salvando...' : 'Confirmar novo SLA'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="knowledge-sla-row-actions">
        {item.assignmentStatus === 'unclaimed' ? (
          <button type="button" className="compact-button" disabled={busyActivityId === item.activityId} onClick={() => void claim(item)}>
            {busyActivityId === item.activityId ? 'Assumindo...' : 'Assumir item'}
          </button>
        ) : null}
        {item.isMine ? (
          <>
            <button type="button" className="secondary compact-button" onClick={() => beginReschedule(item)}>Reagendar SLA</button>
            <button type="button" className="secondary compact-button" disabled={busyActivityId === item.activityId} onClick={() => release(item)}>
              {busyActivityId === item.activityId ? 'Liberando...' : 'Liberar'}
            </button>
          </>
        ) : null}
        {item.assignmentStatus === 'assigned' && !item.isMine ? <small>Atribuído a {item.taskOwnerDisplayName ?? 'outro usuário'}</small> : null}
        <Link to={`/companies/${item.companyId}`} className="button secondary compact-button">Abrir empresa</Link>
      </div>
    </article>
  );

  return (
    <section className="knowledge-sla-panel">
      <div className="knowledge-sla-head">
        <div>
          <span className="section-label">Outcome Workbench V9</span>
          <h3>Ownership e SLA da fila de resultados</h3>
          <p>
            Define quem responde por cada resultado e quando ele deve ser tratado. Assumir uma atividade histórica é uma ação explícita e auditável — não existe adoção automática ou em lote.
            A visão {companyId ? `está filtrada para ${companyName ?? 'a empresa selecionada'}` : 'cobre toda a operação'}.
          </p>
        </div>
        <div className="pill-row">
          <Pill tone="success">ownership real</Pill>
          <Pill tone="info">SLA por prioridade</Pill>
          <button type="button" className="secondary compact-button" disabled={loading} onClick={() => void load()}>
            {loading ? 'Atualizando...' : 'Atualizar ownership'}
          </button>
        </div>
      </div>

      {notice ? <div className="data-banner data-banner-success"><Pill tone="success">ok</Pill><span>{notice}</span></div> : null}
      {error ? <div className="data-banner data-banner-warning"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {loading && !data ? <p className="knowledge-sla-muted">Carregando ownership, SLA e filas pessoais...</p> : null}

      {data ? (
        <>
          <div className="mini-metric-grid knowledge-sla-metrics">
            <Stat label="Minha fila" value={String(data.summary.myItems)} helper="resultados sob minha responsabilidade" />
            <Stat label="Sem dono" value={String(data.summary.unassignedItems)} helper="itens disponíveis para assumir" />
            <Stat label="SLA vencido" value={String(data.summary.breachedItems)} helper="ownership ativo fora do prazo" />
            <Stat label="Vence em 24h" value={String(data.summary.dueSoonItems)} helper="itens que exigem ação imediata" />
          </div>

          <div className="knowledge-sla-policy">
            <Pill tone="warning">política operacional</Pill>
            <span>
              Imediata {data.slaPolicy.immediateHours}h · Alta {data.slaPolicy.highHours}h · Revisar {data.slaPolicy.reviewHours}h · Baixa {data.slaPolicy.lowHours}h.
              O SLA organiza trabalho; não altera score, qualification ou pipeline.
            </span>
          </div>

          <div className="knowledge-operations-tabs" role="tablist" aria-label="Ownership e SLA do Outcome Workbench">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? 'active' : ''}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}<span>{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="knowledge-sla-list">
            {activeItems.length ? activeItems.map(renderItem) : (
              <EmptyState
                title={activeTab === 'mine' ? 'Nenhum item sob sua responsabilidade.' : 'Nenhum item nesta fila.'}
                description={activeTab === 'unclaimed'
                  ? 'Todos os outcomes instrumentados possuem dono ou ainda não existem atividades elegíveis.'
                  : 'A fila está vazia para o recorte selecionado.'}
              />
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
