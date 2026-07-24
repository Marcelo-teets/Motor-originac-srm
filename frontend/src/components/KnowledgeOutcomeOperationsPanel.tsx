import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Pill, Stat } from './UI';
import { useAuth } from '../lib/auth';
import { knowledgeOutcomeApi } from '../lib/knowledgeOutcomeApi';
import type { KnowledgeOutcomeOperations } from '../lib/knowledgeOutcomeTypes';
import '../styles/knowledge-outcome-operations.css';

type Props = {
  companyId?: string;
  companyName?: string;
  refreshToken?: number;
  onChanged?: () => void;
};

type QueueTab = 'outcomes' | 'tasks' | 'adoption' | 'pipeline';

const activityLabels: Record<string, string> = {
  follow_up: 'Follow-up',
  meeting: 'Reunião',
  email: 'E-mail',
  call: 'Ligação',
  research: 'Análise / pesquisa',
  document: 'Documento',
  committee: 'Comitê',
  other: 'Outra ação',
};

const formatActivity = (value: string) => activityLabels[value]
  ?? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('pt-BR'));

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'sem prazo';

const createKey = (activityId: string) => {
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `outcome-adoption:${activityId}:${token}`;
};

export function KnowledgeOutcomeOperationsPanel({
  companyId,
  companyName,
  refreshToken = 0,
  onChanged,
}: Props) {
  const { session } = useAuth();
  const [data, setData] = useState<KnowledgeOutcomeOperations | null>(null);
  const [activeTab, setActiveTab] = useState<QueueTab>('outcomes');
  const [loading, setLoading] = useState(true);
  const [busyActivityId, setBusyActivityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await knowledgeOutcomeApi.getOperations(session, companyId, 365);
      setData(loaded);
      return loaded;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a fila de Outcome Operations.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void knowledgeOutcomeApi.getOperations(session, companyId, 365)
      .then((loaded) => { if (active) setData(loaded); })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a fila de Outcome Operations.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, refreshToken, session?.access_token]);

  const tabs = useMemo(() => [
    { key: 'outcomes' as const, label: 'Resultados', count: data?.summary.pendingOutcomes ?? 0 },
    { key: 'tasks' as const, label: 'Pendências', count: (data?.summary.overdueTasks ?? 0) + (data?.summary.dueSoonTasks ?? 0) },
    { key: 'adoption' as const, label: 'Instrumentar histórico', count: data?.summary.adoptionCandidates ?? 0 },
    { key: 'pipeline' as const, label: 'Pipeline', count: data?.summary.stalePipelines ?? 0 },
  ], [data?.summary]);

  const adoptActivity = async (activityId: string) => {
    if (!window.confirm('Instrumentar esta atividade histórica? O sistema criará uma nota reconstruída e uma tarefa para confirmar o resultado.')) return;
    setBusyActivityId(activityId);
    setError(null);
    setNotice(null);
    try {
      const result = await knowledgeOutcomeApi.adoptExistingActivity(session, activityId, createKey(activityId));
      await load();
      onChanged?.();
      setNotice(result.status === 'already_instrumented'
        ? 'A atividade já estava instrumentada e foi reutilizada sem duplicidade.'
        : 'Atividade instrumentada: nota histórica, lineage e tarefa de resultado criados no Supabase.');
      setActiveTab('outcomes');
    } catch (adoptionError) {
      setError(adoptionError instanceof Error ? adoptionError.message : 'Falha ao instrumentar a atividade histórica.');
    } finally {
      setBusyActivityId(null);
    }
  };

  return (
    <section className="knowledge-operations-panel">
      <div className="knowledge-operations-head">
        <div>
          <span className="section-label">Outcome Operations V7</span>
          <h3>Fila de captura de resultados reais</h3>
          <p>
            Concentra ações sem resultado, tarefas vencidas, próximas pendências e atividades históricas que ainda não alimentam o aprendizado.
            A visão {companyId ? `está filtrada para ${companyName ?? 'a empresa selecionada'}` : 'cobre toda a operação'}.
          </p>
        </div>
        <div className="pill-row">
          <Pill tone="info">janela 365 dias</Pill>
          <Pill tone={companyId ? 'warning' : 'default'}>{companyId ? 'escopo empresa' : 'escopo global'}</Pill>
          <button type="button" className="secondary compact-button" disabled={loading} onClick={() => void load()}>
            {loading ? 'Atualizando...' : 'Atualizar fila'}
          </button>
        </div>
      </div>

      {notice ? <div className="data-banner data-banner-success"><Pill tone="success">ok</Pill><span>{notice}</span></div> : null}
      {error ? <div className="data-banner data-banner-warning"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {loading && !data ? <p className="knowledge-operations-muted">Carregando atividades, tarefas e pipeline...</p> : null}

      {data ? (
        <>
          <div className="mini-metric-grid knowledge-operations-metrics">
            <Stat label="Aguardando resultado" value={String(data.summary.pendingOutcomes)} helper="ações instrumentadas e abertas" />
            <Stat label="Tarefas vencidas" value={String(data.summary.overdueTasks)} helper="pendências com empresa vinculada" />
            <Stat label="Próximos 7 dias" value={String(data.summary.dueSoonTasks)} helper="tarefas que exigem acompanhamento" />
            <Stat label="Pipeline sem ação" value={String(data.summary.stalePipelines)} helper="próxima ação ausente ou vencida" />
            <Stat label="Histórico instrumentável" value={String(data.summary.adoptionCandidates)} helper="atividades ainda fora do lineage" />
          </div>

          <div className="knowledge-operations-caveat">
            <Pill tone="warning">governança humana</Pill>
            <span>{data.caveat}</span>
          </div>

          <div className="knowledge-operations-tabs" role="tablist" aria-label="Filas de Outcome Operations">
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

          {activeTab === 'outcomes' ? (
            <div className="knowledge-operations-list">
              {data.pendingOutcomes.length ? data.pendingOutcomes.map((item) => (
                <article key={item.activityId} className="knowledge-operations-row outcome-row">
                  <div className="knowledge-operations-row-main">
                    <div className="pill-row">
                      <Pill tone="warning">{item.ageDays}d em aberto</Pill>
                      <Pill tone={item.contextMode === 'captured_at_action' ? 'success' : 'info'}>
                        {item.contextMode === 'captured_at_action' ? 'contexto capturado' : 'contexto reconstruído'}
                      </Pill>
                      <Pill tone="default">{formatActivity(item.activityType)}</Pill>
                    </div>
                    <strong>{item.title}</strong>
                    <span>{item.companyName} · Base: {item.nodeTitle}</span>
                    {item.description ? <p>{item.description}</p> : null}
                  </div>
                  <div className="knowledge-operations-row-meta">
                    <small>Ação em {formatDate(item.occurredAt)}</small>
                    <small>Prazo: {formatDate(item.dueAt)}</small>
                    <Link to={`/companies/${item.companyId}`} className="button compact-button">Abrir e registrar</Link>
                  </div>
                </article>
              )) : (
                <EmptyState title="Nenhum resultado pendente instrumentado." description="Use a aba Instrumentar histórico ou crie novas ações no Company Detail para iniciar a coleta." />
              )}
            </div>
          ) : null}

          {activeTab === 'tasks' ? (
            <div className="knowledge-operations-list">
              {[...data.overdueTasks, ...data.dueSoonTasks].length ? [...data.overdueTasks, ...data.dueSoonTasks].map((task) => (
                <article key={task.taskId} className="knowledge-operations-row task-row">
                  <div className="knowledge-operations-row-main">
                    <div className="pill-row">
                      <Pill tone={task.dueAt && new Date(task.dueAt) < new Date() ? 'danger' : 'info'}>
                        {task.dueAt && new Date(task.dueAt) < new Date() ? 'vencida' : 'próximos 7 dias'}
                      </Pill>
                      <Pill tone={task.isOutcomeTask ? 'warning' : 'default'}>{task.isOutcomeTask ? 'resultado' : task.priority || 'normal'}</Pill>
                    </div>
                    <strong>{task.title}</strong>
                    <span>{task.companyName}{task.ownerName ? ` · ${task.ownerName}` : ''}</span>
                    {task.description ? <p>{task.description}</p> : null}
                  </div>
                  <div className="knowledge-operations-row-meta">
                    <small>Prazo: {formatDate(task.dueAt)}</small>
                    <Link to={`/companies/${task.companyId}`} className="button secondary compact-button">Abrir empresa</Link>
                  </div>
                </article>
              )) : (
                <EmptyState title="Nenhuma pendência vencida ou próxima." description="A fila está em dia para a janela operacional atual." />
              )}
            </div>
          ) : null}

          {activeTab === 'adoption' ? (
            <div className="knowledge-operations-list">
              {data.adoptionCandidates.length ? data.adoptionCandidates.map((item) => (
                <article key={item.activityId} className="knowledge-operations-row adoption-row">
                  <div className="knowledge-operations-row-main">
                    <div className="pill-row">
                      <Pill tone="info">atividade existente</Pill>
                      <Pill tone="default">{formatActivity(item.activityType)}</Pill>
                      <Pill tone="warning">{item.ageDays}d atrás</Pill>
                    </div>
                    <strong>{item.title}</strong>
                    <span>{item.companyName}{item.ownerName ? ` · ${item.ownerName}` : ''}</span>
                    {item.description ? <p>{item.description}</p> : null}
                  </div>
                  <div className="knowledge-operations-row-meta">
                    <small>Realizada em {formatDate(item.occurredAt)}</small>
                    <button
                      type="button"
                      className="compact-button"
                      disabled={!item.canAdopt || busyActivityId === item.activityId}
                      onClick={() => void adoptActivity(item.activityId)}
                    >
                      {busyActivityId === item.activityId ? 'Instrumentando...' : 'Instrumentar atividade'}
                    </button>
                  </div>
                </article>
              )) : (
                <EmptyState title="Todo o histórico elegível já está instrumentado." description="Novas atividades criadas pelo Vault já nascem com contexto capturado e não aparecem nesta fila." />
              )}
            </div>
          ) : null}

          {activeTab === 'pipeline' ? (
            <div className="knowledge-operations-list">
              {data.stalePipelines.length ? data.stalePipelines.map((item) => (
                <article key={item.pipelineId} className="knowledge-operations-row pipeline-row">
                  <div className="knowledge-operations-row-main">
                    <div className="pill-row">
                      <Pill tone="warning">{item.reason === 'missing_next_action' ? 'sem próxima ação' : 'ação vencida'}</Pill>
                      <Pill tone="default">{item.stage}</Pill>
                      {item.expectedStructure ? <Pill tone="info">{item.expectedStructure}</Pill> : null}
                    </div>
                    <strong>{item.companyName}</strong>
                    <span>{item.nextAction || 'Próxima ação não definida'}</span>
                  </div>
                  <div className="knowledge-operations-row-meta">
                    <small>Prazo: {formatDate(item.nextActionDueAt)}</small>
                    <Link to={`/companies/${item.companyId}`} className="button secondary compact-button">Corrigir pipeline</Link>
                  </div>
                </article>
              )) : (
                <EmptyState title="Nenhum pipeline sem próxima ação." description="Todas as empresas ativas possuem uma próxima ação vigente." />
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
