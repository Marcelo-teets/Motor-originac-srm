import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Pill, Stat } from './UI';
import { useAuth } from '../lib/auth';
import { knowledgeOutcomeApi } from '../lib/knowledgeOutcomeApi';
import type {
  KnowledgeActivityAdoptionCandidate,
  KnowledgeOutcomeOperations,
  KnowledgeOutcomePriorityContext,
  KnowledgePendingOutcome,
  OutcomeCaptureStatus,
  OutcomePipelineStage,
  OutcomePriorityBand,
} from '../lib/knowledgeOutcomeTypes';
import '../styles/knowledge-outcome-operations.css';

type Props = {
  companyId?: string;
  companyName?: string;
  refreshToken?: number;
  onChanged?: () => void;
};

type QueueTab = 'priority' | 'outcomes' | 'tasks' | 'adoption' | 'pipeline';

type OutcomeDraft = {
  outcomeStatus: OutcomeCaptureStatus;
  outcome: string;
  nextAction: string;
  dueAt: string;
  targetStage: '' | OutcomePipelineStage;
};

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

const stages: OutcomePipelineStage[] = [
  'Identified',
  'Qualified',
  'Approach',
  'Structuring',
  'Mandated',
  'ClosedWon',
  'ClosedLost',
  'Recycled',
];

const outcomeStatuses: Array<{ value: OutcomeCaptureStatus; label: string }> = [
  { value: 'progress', label: 'Avanço' },
  { value: 'won', label: 'Resultado positivo' },
  { value: 'lost', label: 'Resultado negativo' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'no_change', label: 'Sem mudança' },
];

const blankOutcome = (): OutcomeDraft => ({
  outcomeStatus: 'progress',
  outcome: '',
  nextAction: '',
  dueAt: '',
  targetStage: '',
});

const formatActivity = (value: string) => activityLabels[value]
  ?? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('pt-BR'));

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'sem prazo';

const formatScore = (value: number | null) => value === null ? '—' : Math.round(value).toLocaleString('pt-BR');
const toIso = (value: string) => value ? new Date(value).toISOString() : null;

const createKey = (prefix: string, activityId: string) => {
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${activityId}:${token}`;
};

const priorityTone = (band: OutcomePriorityBand) => {
  if (band === 'immediate') return 'danger' as const;
  if (band === 'high') return 'warning' as const;
  if (band === 'review') return 'info' as const;
  return 'default' as const;
};

const priorityLabel: Record<OutcomePriorityBand, string> = {
  immediate: 'imediata',
  high: 'alta',
  review: 'revisar',
  low: 'baixa',
};

function PriorityContext({ item }: { item: KnowledgeOutcomePriorityContext }) {
  return (
    <div className="knowledge-priority-context">
      <div className="pill-row">
        <Pill tone={priorityTone(item.priorityBand)}>prioridade {priorityLabel[item.priorityBand]}</Pill>
        <Pill tone="default">score operacional {item.priorityScore}/100</Pill>
        {item.pipelineStage ? <Pill tone="info">{item.pipelineStage}</Pill> : null}
        {item.expectedStructure ? <Pill tone="default">{item.expectedStructure}</Pill> : null}
      </div>
      <div className="knowledge-priority-metrics">
        <span>Lead <b>{formatScore(item.leadScore)}</b></span>
        <span>Qualification <b>{formatScore(item.qualificationScore)}</b></span>
        <span>Funding need <b>{formatScore(item.fundingNeedScore)}</b></span>
        <span>Urgência <b>{formatScore(item.urgencyScore)}</b></span>
        <span>Pendências vencidas <b>{item.overdueTaskCount}</b></span>
      </div>
      {item.priorityReasons.length ? (
        <div className="knowledge-priority-reasons">
          {item.priorityReasons.map((reason) => <span key={reason}>{reason}</span>)}
        </div>
      ) : null}
    </div>
  );
}

export function KnowledgeOutcomeOperationsPanel({
  companyId,
  companyName,
  refreshToken = 0,
  onChanged,
}: Props) {
  const { session } = useAuth();
  const [data, setData] = useState<KnowledgeOutcomeOperations | null>(null);
  const [activeTab, setActiveTab] = useState<QueueTab>('priority');
  const [loading, setLoading] = useState(true);
  const [busyActivityId, setBusyActivityId] = useState<string | null>(null);
  const [captureActivityId, setCaptureActivityId] = useState<string | null>(null);
  const [captureNodeId, setCaptureNodeId] = useState<string | null>(null);
  const [outcomeDraft, setOutcomeDraft] = useState<OutcomeDraft>(() => blankOutcome());
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

  const priorityCandidates = useMemo(
    () => data?.adoptionCandidates.filter((item) => item.priorityBand === 'immediate' || item.priorityBand === 'high') ?? [],
    [data?.adoptionCandidates],
  );
  const priorityTasks = useMemo(
    () => data?.overdueTasks.filter((task) => !task.isOutcomeTask) ?? [],
    [data?.overdueTasks],
  );

  const tabs = useMemo(() => [
    { key: 'priority' as const, label: 'Fila do dia', count: data?.summary.dailyQueueItems ?? 0 },
    { key: 'outcomes' as const, label: 'Resultados', count: data?.summary.pendingOutcomes ?? 0 },
    { key: 'tasks' as const, label: 'Pendências', count: (data?.summary.overdueTasks ?? 0) + (data?.summary.dueSoonTasks ?? 0) },
    { key: 'adoption' as const, label: 'Instrumentar histórico', count: data?.summary.adoptionCandidates ?? 0 },
    { key: 'pipeline' as const, label: 'Pipeline', count: data?.summary.stalePipelines ?? 0 },
  ], [data?.summary]);

  const beginCapture = (activityId: string, nodeId?: string | null) => {
    setCaptureActivityId(activityId);
    setCaptureNodeId(nodeId ?? null);
    setOutcomeDraft(blankOutcome());
    setError(null);
    setNotice(null);
  };

  const cancelCapture = () => {
    setCaptureActivityId(null);
    setCaptureNodeId(null);
    setOutcomeDraft(blankOutcome());
  };

  const adoptActivity = async (activityId: string) => {
    if (!window.confirm('Instrumentar esta atividade histórica? O sistema criará uma nota reconstruída e uma tarefa para confirmar o resultado.')) return;
    setBusyActivityId(activityId);
    setError(null);
    setNotice(null);
    try {
      const result = await knowledgeOutcomeApi.adoptExistingActivity(session, activityId, createKey('outcome-adoption', activityId));
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

  const submitOutcome = async () => {
    if (!captureActivityId || !outcomeDraft.outcome.trim()) {
      setError('Descreva o resultado observado antes de concluir.');
      return;
    }

    setBusyActivityId(captureActivityId);
    setError(null);
    setNotice(null);
    try {
      const result = await knowledgeOutcomeApi.captureExistingActivityOutcome(session, {
        activityId: captureActivityId,
        adoptionIdempotencyKey: createKey('outcome-adoption', captureActivityId),
        completionIdempotencyKey: createKey('outcome-completion', captureActivityId),
        outcomeStatus: outcomeDraft.outcomeStatus,
        outcome: outcomeDraft.outcome.trim(),
        nextAction: outcomeDraft.nextAction.trim() || null,
        dueAt: toIso(outcomeDraft.dueAt),
        targetStage: outcomeDraft.targetStage || null,
        nodeId: captureNodeId,
      });
      await load();
      onChanged?.();
      cancelCapture();
      setNotice(result.status === 'already_completed'
        ? 'O resultado já estava registrado e foi reutilizado sem duplicidade.'
        : 'Resultado confirmado: atividade, nota, tarefa e pipeline foram atualizados com lineage auditável.');
      setActiveTab('priority');
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Falha ao registrar o resultado observado.');
    } finally {
      setBusyActivityId(null);
    }
  };

  const captureComposer = (activityId: string) => captureActivityId === activityId ? (
    <div className="knowledge-outcome-inline-composer">
      <div className="knowledge-outcome-form-grid">
        <label>
          <span>Classificação do resultado</span>
          <select
            value={outcomeDraft.outcomeStatus}
            onChange={(event) => setOutcomeDraft({ ...outcomeDraft, outcomeStatus: event.target.value as OutcomeCaptureStatus })}
          >
            {outcomeStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </label>
        <label>
          <span>Estágio solicitado</span>
          <select
            value={outcomeDraft.targetStage}
            onChange={(event) => setOutcomeDraft({ ...outcomeDraft, targetStage: event.target.value as OutcomeDraft['targetStage'] })}
          >
            <option value="">Manter estágio</option>
            {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
        </label>
        <label className="knowledge-outcome-form-wide">
          <span>Fato observado / decisão</span>
          <textarea
            rows={4}
            value={outcomeDraft.outcome}
            onChange={(event) => setOutcomeDraft({ ...outcomeDraft, outcome: event.target.value })}
            placeholder="Registre somente o que efetivamente aconteceu: resposta, objeção, decisão, documento recebido ou motivo do bloqueio."
          />
        </label>
        <label>
          <span>Próxima ação</span>
          <input
            value={outcomeDraft.nextAction}
            onChange={(event) => setOutcomeDraft({ ...outcomeDraft, nextAction: event.target.value })}
            placeholder="Ex.: Agendar diligência e solicitar carteira"
          />
        </label>
        <label>
          <span>Novo prazo</span>
          <input
            type="datetime-local"
            value={outcomeDraft.dueAt}
            onChange={(event) => setOutcomeDraft({ ...outcomeDraft, dueAt: event.target.value })}
          />
        </label>
      </div>
      <div className="knowledge-outcome-composer-footer">
        <small>Nenhum campo é inferido. Estágio e próxima ação só mudam quando preenchidos explicitamente.</small>
        <button type="button" className="secondary compact-button" onClick={cancelCapture}>Cancelar</button>
        <button type="button" className="compact-button" disabled={busyActivityId === activityId} onClick={() => void submitOutcome()}>
          {busyActivityId === activityId ? 'Registrando...' : 'Confirmar resultado real'}
        </button>
      </div>
    </div>
  ) : null;

  const renderPendingOutcome = (item: KnowledgePendingOutcome) => (
    <article key={item.activityId} className={`knowledge-operations-row outcome-row ${captureActivityId === item.activityId ? 'has-composer' : ''}`}>
      <div className="knowledge-operations-row-main">
        <PriorityContext item={item} />
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
        <button type="button" className="compact-button" onClick={() => beginCapture(item.activityId, item.nodeId)}>Registrar resultado</button>
        <Link to={`/companies/${item.companyId}`} className="button secondary compact-button">Abrir empresa</Link>
      </div>
      {captureComposer(item.activityId)}
    </article>
  );

  const renderAdoptionCandidate = (item: KnowledgeActivityAdoptionCandidate) => (
    <article key={item.activityId} className={`knowledge-operations-row adoption-row ${captureActivityId === item.activityId ? 'has-composer' : ''}`}>
      <div className="knowledge-operations-row-main">
        <PriorityContext item={item} />
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
          onClick={() => beginCapture(item.activityId)}
        >
          Registrar resultado agora
        </button>
        <button
          type="button"
          className="secondary compact-button"
          disabled={!item.canAdopt || busyActivityId === item.activityId}
          onClick={() => void adoptActivity(item.activityId)}
        >
          {busyActivityId === item.activityId ? 'Instrumentando...' : 'Só instrumentar'}
        </button>
      </div>
      {captureComposer(item.activityId)}
    </article>
  );

  const renderTask = (task: KnowledgeOutcomeOperations['overdueTasks'][number]) => (
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
  );

  return (
    <section className="knowledge-operations-panel">
      <div className="knowledge-operations-head">
        <div>
          <span className="section-label">Outcome Workbench V8</span>
          <h3>Fila priorizada para registrar resultados reais</h3>
          <p>
            Ordena atividades por contexto comercial, scores oficiais, funding need, urgência e pendências — sem reescrever nenhum motor de decisão.
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
            <Stat label="Fila do dia" value={String(data.summary.dailyQueueItems)} helper="resultados, altas prioridades e tarefas vencidas" />
            <Stat label="Prioridade imediata" value={String(data.summary.immediateCandidates)} helper="score operacional ≥ 80" />
            <Stat label="Alta prioridade" value={String(data.summary.highPriorityCandidates)} helper="histórico recomendado para captura" />
            <Stat label="Aguardando resultado" value={String(data.summary.pendingOutcomes)} helper="ações instrumentadas e abertas" />
            <Stat label="Tarefas vencidas" value={String(data.summary.overdueTasks)} helper="pendências com empresa vinculada" />
            <Stat label="Próximos 7 dias" value={String(data.summary.dueSoonTasks)} helper="tarefas que exigem acompanhamento" />
          </div>

          <div className="knowledge-operations-caveat">
            <Pill tone="warning">ordenação, não score</Pill>
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

          {activeTab === 'priority' ? (
            <div className="knowledge-priority-sections">
              {data.pendingOutcomes.length ? (
                <section>
                  <div className="knowledge-queue-section-head"><span className="section-label">Resultados pendentes</span><strong>{data.pendingOutcomes.length}</strong></div>
                  <div className="knowledge-operations-list">{data.pendingOutcomes.map(renderPendingOutcome)}</div>
                </section>
              ) : null}
              {priorityCandidates.length ? (
                <section>
                  <div className="knowledge-queue-section-head"><span className="section-label">Histórico prioritário</span><strong>{priorityCandidates.length}</strong></div>
                  <div className="knowledge-operations-list">{priorityCandidates.map(renderAdoptionCandidate)}</div>
                </section>
              ) : null}
              {priorityTasks.length ? (
                <section>
                  <div className="knowledge-queue-section-head"><span className="section-label">Tarefas vencidas</span><strong>{priorityTasks.length}</strong></div>
                  <div className="knowledge-operations-list">{priorityTasks.map(renderTask)}</div>
                </section>
              ) : null}
              {!data.pendingOutcomes.length && !priorityCandidates.length && !priorityTasks.length ? (
                <EmptyState title="Fila diária concluída." description="Não há resultados pendentes, histórico de alta prioridade ou tarefas vencidas fora do fluxo de outcome." />
              ) : null}
            </div>
          ) : null}

          {activeTab === 'outcomes' ? (
            <div className="knowledge-operations-list">
              {data.pendingOutcomes.length ? data.pendingOutcomes.map(renderPendingOutcome) : (
                <EmptyState title="Nenhum resultado pendente instrumentado." description="Use a aba Instrumentar histórico ou registre um resultado diretamente na fila priorizada." />
              )}
            </div>
          ) : null}

          {activeTab === 'tasks' ? (
            <div className="knowledge-operations-list">
              {[...data.overdueTasks, ...data.dueSoonTasks].length ? [...data.overdueTasks, ...data.dueSoonTasks].map(renderTask) : (
                <EmptyState title="Nenhuma pendência vencida ou próxima." description="A fila está em dia para a janela operacional atual." />
              )}
            </div>
          ) : null}

          {activeTab === 'adoption' ? (
            <div className="knowledge-operations-list">
              {data.adoptionCandidates.length ? data.adoptionCandidates.map(renderAdoptionCandidate) : (
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
