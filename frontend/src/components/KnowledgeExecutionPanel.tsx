import { useEffect, useMemo, useState } from 'react';
import { EmptyState, Pill, Stat } from './UI';
import { useAuth } from '../lib/auth';
import { knowledgeVaultApi } from '../lib/knowledgeVaultApi';
import type {
  CompleteKnowledgeExecutionInput,
  CreateKnowledgeExecutionInput,
  KnowledgeActivityType,
  KnowledgeExecutionItem,
  KnowledgeExecutionWorkspace,
  KnowledgeNodeSummary,
  KnowledgeOutcomeStatus,
  KnowledgePipelineStage,
} from '../lib/knowledgeVaultTypes';
import '../styles/knowledge-execution.css';

type Props = {
  companyId: string;
  nodes: KnowledgeNodeSummary[];
  execution: KnowledgeExecutionWorkspace;
  onRefresh: () => Promise<void>;
};

type ActionDraft = {
  nodeId: string;
  activityType: KnowledgeActivityType;
  title: string;
  description: string;
  nextAction: string;
  dueAt: string;
  targetStage: '' | KnowledgePipelineStage;
};

type OutcomeDraft = {
  outcomeStatus: KnowledgeOutcomeStatus;
  outcome: string;
  nextAction: string;
  dueAt: string;
  targetStage: '' | KnowledgePipelineStage;
};

const stages: KnowledgePipelineStage[] = [
  'Identified',
  'Qualified',
  'Approach',
  'Structuring',
  'Mandated',
  'ClosedWon',
  'ClosedLost',
  'Recycled',
];

const activityTypes: Array<{ value: KnowledgeActivityType; label: string }> = [
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'email', label: 'E-mail' },
  { value: 'call', label: 'Ligação' },
  { value: 'research', label: 'Análise / pesquisa' },
  { value: 'committee', label: 'Comitê' },
  { value: 'other', label: 'Outra ação' },
];

const outcomeStatuses: Array<{ value: KnowledgeOutcomeStatus; label: string }> = [
  { value: 'progress', label: 'Avanço' },
  { value: 'won', label: 'Resultado positivo' },
  { value: 'lost', label: 'Resultado negativo' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'no_change', label: 'Sem mudança' },
];

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'sem prazo';

const toIso = (value: string) => value ? new Date(value).toISOString() : null;
const createKey = (prefix: string) => {
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${token}`;
};

const blankAction = (nodeId = ''): ActionDraft => ({
  nodeId,
  activityType: 'follow_up',
  title: '',
  description: '',
  nextAction: '',
  dueAt: '',
  targetStage: '',
});

const blankOutcome = (): OutcomeDraft => ({
  outcomeStatus: 'progress',
  outcome: '',
  nextAction: '',
  dueAt: '',
  targetStage: '',
});

const executionTone = (item: KnowledgeExecutionItem) => {
  if (item.status === 'done') return item.outcomeStatus === 'blocked' || item.outcomeStatus === 'lost' ? 'warning' : 'success';
  return 'info';
};

export function KnowledgeExecutionPanel({ companyId, nodes, execution, onRefresh }: Props) {
  const { session } = useAuth();
  const defaultNodeId = useMemo(
    () => nodes.find((node) => node.nodeType === 'thesis')?.id ?? nodes[0]?.id ?? '',
    [nodes],
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [actionDraft, setActionDraft] = useState<ActionDraft>(() => blankAction(defaultNodeId));
  const [outcomeActivityId, setOutcomeActivityId] = useState<string | null>(null);
  const [outcomeDraft, setOutcomeDraft] = useState<OutcomeDraft>(() => blankOutcome());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actionDraft.nodeId && defaultNodeId) {
      setActionDraft((current) => ({ ...current, nodeId: defaultNodeId }));
    }
  }, [actionDraft.nodeId, defaultNodeId]);

  const openExecutions = useMemo(
    () => execution.executions.filter((item) => item.status !== 'done').length,
    [execution.executions],
  );

  const submitAction = async () => {
    if (!actionDraft.nodeId) {
      setError('Crie ou selecione uma nota vinculada à empresa antes de executar uma ação.');
      return;
    }
    if (!actionDraft.title.trim()) {
      setError('Informe o título da ação.');
      return;
    }

    const input: CreateKnowledgeExecutionInput = {
      nodeId: actionDraft.nodeId,
      idempotencyKey: createKey(`knowledge-action:${companyId}`),
      activityType: actionDraft.activityType,
      title: actionDraft.title.trim(),
      description: actionDraft.description.trim() || null,
      nextAction: actionDraft.nextAction.trim() || null,
      dueAt: toIso(actionDraft.dueAt),
      targetStage: actionDraft.targetStage || null,
    };

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await knowledgeVaultApi.createExecutionAction(session, input);
      await onRefresh();
      setActionDraft(blankAction(actionDraft.nodeId));
      setComposerOpen(false);
      setNotice('Ação criada no CRM real, vinculada à nota e refletida no pipeline.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Falha ao criar a ação da tese.');
    } finally {
      setBusy(false);
    }
  };

  const beginOutcome = (item: KnowledgeExecutionItem) => {
    setOutcomeActivityId(item.activityId);
    setOutcomeDraft(blankOutcome());
    setError(null);
    setNotice(null);
  };

  const submitOutcome = async () => {
    if (!outcomeActivityId || !outcomeDraft.outcome.trim()) {
      setError('Descreva o resultado observado.');
      return;
    }

    const input: CompleteKnowledgeExecutionInput = {
      activityId: outcomeActivityId,
      idempotencyKey: createKey(`knowledge-outcome:${outcomeActivityId}`),
      outcomeStatus: outcomeDraft.outcomeStatus,
      outcome: outcomeDraft.outcome.trim(),
      nextAction: outcomeDraft.nextAction.trim() || null,
      dueAt: toIso(outcomeDraft.dueAt),
      targetStage: outcomeDraft.targetStage || null,
    };

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await knowledgeVaultApi.completeExecutionAction(session, input);
      await onRefresh();
      setOutcomeActivityId(null);
      setOutcomeDraft(blankOutcome());
      setNotice('Resultado registrado, tarefa anterior concluída e próximo passo atualizado com lineage.');
    } catch (outcomeError) {
      setError(outcomeError instanceof Error ? outcomeError.message : 'Falha ao registrar o resultado da ação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="company-knowledge-section knowledge-execution-section">
      <div className="knowledge-execution-head">
        <div>
          <span className="section-label">Execução da tese</span>
          <h4>Conhecimento → ação → resultado</h4>
          <p>Transforme uma nota governada em atividade, tarefa e próxima ação no pipeline existente.</p>
        </div>
        <button
          type="button"
          className="compact-button"
          disabled={!nodes.length || busy}
          onClick={() => setComposerOpen((current) => !current)}
        >
          {composerOpen ? 'Fechar' : '+ Executar ação'}
        </button>
      </div>

      <div className="mini-metric-grid knowledge-execution-metrics">
        <Stat label="Estágio atual" value={execution.pipeline?.stage ?? 'Fora do pipeline'} helper={execution.pipeline?.status ?? 'sem status'} />
        <Stat label="Ações abertas" value={String(openExecutions)} helper="atividades ligadas a notas" />
        <Stat label="Tarefas abertas" value={String(execution.openTaskCount)} helper="originadas pelo Vault" />
        <Stat label="Próxima ação" value={execution.pipeline?.nextAction ?? 'Não definida'} helper={formatDate(execution.pipeline?.nextActionDueAt ?? null)} />
      </div>

      {notice ? <div className="data-banner data-banner-success"><Pill tone="success">ok</Pill><span>{notice}</span></div> : null}
      {error ? <div className="data-banner data-banner-warning"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}

      {composerOpen ? (
        <div className="knowledge-execution-composer">
          <div className="knowledge-execution-form-grid">
            <label>
              <span>Nota que sustenta a ação</span>
              <select value={actionDraft.nodeId} onChange={(event) => setActionDraft({ ...actionDraft, nodeId: event.target.value })}>
                <option value="">Selecione</option>
                {nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
              </select>
            </label>
            <label>
              <span>Tipo</span>
              <select value={actionDraft.activityType} onChange={(event) => setActionDraft({ ...actionDraft, activityType: event.target.value as KnowledgeActivityType })}>
                {activityTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="knowledge-execution-wide">
              <span>Ação</span>
              <input value={actionDraft.title} onChange={(event) => setActionDraft({ ...actionDraft, title: event.target.value })} placeholder="Ex.: Validar carteira e concentração com o CFO" />
            </label>
            <label className="knowledge-execution-wide">
              <span>Contexto / objetivo</span>
              <textarea value={actionDraft.description} onChange={(event) => setActionDraft({ ...actionDraft, description: event.target.value })} rows={3} placeholder="Explique por que a ação decorre da tese e qual evidência deve ser obtida." />
            </label>
            <label>
              <span>Próxima ação no pipeline</span>
              <input value={actionDraft.nextAction} onChange={(event) => setActionDraft({ ...actionDraft, nextAction: event.target.value })} placeholder="Ex.: Agendar diligência de carteira" />
            </label>
            <label>
              <span>Prazo</span>
              <input type="datetime-local" value={actionDraft.dueAt} onChange={(event) => setActionDraft({ ...actionDraft, dueAt: event.target.value })} />
            </label>
            <label>
              <span>Estágio solicitado</span>
              <select value={actionDraft.targetStage} onChange={(event) => setActionDraft({ ...actionDraft, targetStage: event.target.value as ActionDraft['targetStage'] })}>
                <option value="">Manter estágio</option>
                {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </label>
          </div>
          <div className="knowledge-execution-composer-actions">
            <small>O motor pode ajustar estágio, status ou prioridade conforme os guardrails de evidência. O solicitado e o efetivo ficam registrados.</small>
            <button type="button" disabled={busy} onClick={() => void submitAction()}>{busy ? 'Criando...' : 'Criar ação rastreável'}</button>
          </div>
        </div>
      ) : null}

      <div className="knowledge-execution-list">
        {execution.executions.length ? execution.executions.map((item) => (
          <article key={item.activityId} className="knowledge-execution-item">
            <div className="knowledge-execution-item-head">
              <div>
                <div className="pill-row">
                  <Pill tone={executionTone(item)}>{item.status === 'done' ? item.outcomeStatus ?? 'concluída' : 'aberta'}</Pill>
                  <Pill tone="default">{activityTypes.find((type) => type.value === item.activityType)?.label ?? item.activityType}</Pill>
                  {item.taskStatus ? <Pill tone={item.taskStatus === 'done' ? 'success' : 'info'}>tarefa {item.taskStatus}</Pill> : null}
                </div>
                <strong>{item.title}</strong>
                <span>Base: {item.nodeTitle}</span>
              </div>
              <small>{formatDate(item.occurredAt)}</small>
            </div>

            {item.description ? <p>{item.description}</p> : null}
            <div className="knowledge-execution-lineage">
              <span>Estágio: {item.fromStage || '—'} → {item.toStage || execution.pipeline?.stage || '—'}</span>
              {item.requestedStage && item.requestedStage !== item.toStage ? <Pill tone="warning">solicitado {item.requestedStage}</Pill> : null}
              <span>Próxima ação: {item.taskTitle || item.actualNextAction || 'não definida'}</span>
              <span>Prazo: {formatDate(item.dueAt)}</span>
            </div>

            {item.status === 'done' ? (
              <div className="knowledge-execution-outcome">
                <strong>Resultado</strong>
                <p>{item.outcome || 'Resultado não descrito.'}</p>
                <small>Concluído em {formatDate(item.completedAt)}</small>
              </div>
            ) : (
              <button type="button" className="secondary compact-button" disabled={busy} onClick={() => beginOutcome(item)}>Registrar resultado</button>
            )}

            {outcomeActivityId === item.activityId ? (
              <div className="knowledge-outcome-composer">
                <div className="knowledge-execution-form-grid">
                  <label>
                    <span>Resultado</span>
                    <select value={outcomeDraft.outcomeStatus} onChange={(event) => setOutcomeDraft({ ...outcomeDraft, outcomeStatus: event.target.value as KnowledgeOutcomeStatus })}>
                      {outcomeStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Estágio solicitado</span>
                    <select value={outcomeDraft.targetStage} onChange={(event) => setOutcomeDraft({ ...outcomeDraft, targetStage: event.target.value as OutcomeDraft['targetStage'] })}>
                      <option value="">Manter estágio</option>
                      {stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                    </select>
                  </label>
                  <label className="knowledge-execution-wide">
                    <span>O que aconteceu</span>
                    <textarea value={outcomeDraft.outcome} onChange={(event) => setOutcomeDraft({ ...outcomeDraft, outcome: event.target.value })} rows={3} placeholder="Registre fatos, decisão, objeção, dado recebido ou motivo do bloqueio." />
                  </label>
                  <label>
                    <span>Próxima ação</span>
                    <input value={outcomeDraft.nextAction} onChange={(event) => setOutcomeDraft({ ...outcomeDraft, nextAction: event.target.value })} placeholder="Nova tarefa, quando aplicável" />
                  </label>
                  <label>
                    <span>Novo prazo</span>
                    <input type="datetime-local" value={outcomeDraft.dueAt} onChange={(event) => setOutcomeDraft({ ...outcomeDraft, dueAt: event.target.value })} />
                  </label>
                </div>
                <div className="knowledge-execution-composer-actions">
                  <button type="button" className="secondary" onClick={() => setOutcomeActivityId(null)}>Cancelar</button>
                  <button type="button" disabled={busy} onClick={() => void submitOutcome()}>{busy ? 'Registrando...' : 'Concluir e registrar resultado'}</button>
                </div>
              </div>
            ) : null}
          </article>
        )) : (
          <EmptyState title="Nenhuma tese foi convertida em execução." description="Selecione uma nota, crie uma ação e conecte inteligência com o pipeline comercial real." />
        )}
      </div>
    </section>
  );
}
