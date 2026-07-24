import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Pill, Stat } from './UI';
import { useAuth } from '../lib/auth';
import { knowledgeVaultApi } from '../lib/knowledgeVaultApi';
import type {
  KnowledgeActivityType,
  KnowledgeCompanyWorkspace,
  KnowledgeExecutionWorkspace,
  KnowledgeNodeSummary,
  KnowledgeOutcomeStatus,
  KnowledgePipelineStage,
} from '../lib/knowledgeVaultTypes';
import '../styles/company-decision-activation.css';

type Props = { companyId: string };

type DecisionCode =
  | 'advance_diligence'
  | 'structure_fidc'
  | 'structure_dcm'
  | 'monitor'
  | 'recycle'
  | 'no_fit';

type DecisionDefinition = {
  label: string;
  activityType: KnowledgeActivityType;
  requestedStage: KnowledgePipelineStage | null;
  nextAction: string;
  objective: string;
};

type OutcomeDraft = {
  idempotencyKey: string;
  outcomeStatus: KnowledgeOutcomeStatus;
  observedOutcome: string;
  confirmedFacts: string;
  remainingGaps: string;
  nextAction: string;
  dueAt: string;
  requestedStage: '' | KnowledgePipelineStage;
};

const stageOrder: KnowledgePipelineStage[] = [
  'Identified',
  'Qualified',
  'Approach',
  'Structuring',
  'Mandated',
  'ClosedWon',
  'ClosedLost',
  'Recycled',
];

const decisions: Record<DecisionCode, DecisionDefinition> = {
  advance_diligence: {
    label: 'Avançar diligência',
    activityType: 'research',
    requestedStage: 'Qualified',
    nextAction: 'Solicitar dados e agendar diligência financeira e de carteira',
    objective: 'Validar funding gap, ativo financiável, performance, concentração, prazo e capacidade de reporte.',
  },
  structure_fidc: {
    label: 'Estruturar alternativa FIDC',
    activityType: 'committee',
    requestedStage: 'Structuring',
    nextAction: 'Validar carteira elegível e preparar desenho preliminar de FIDC',
    objective: 'Confirmar elegibilidade, cessão, concentração, subordinação, garantias, conta vinculada e governança.',
  },
  structure_dcm: {
    label: 'Estruturar alternativa DCM',
    activityType: 'committee',
    requestedStage: 'Structuring',
    nextAction: 'Validar dívida, uso de recursos e preparar alternativa preliminar de DCM',
    objective: 'Confirmar ticket, prazo, amortização, garantias, covenants, capacidade de pagamento e investidores aderentes.',
  },
  monitor: {
    label: 'Manter em monitoramento',
    activityType: 'follow_up',
    requestedStage: null,
    nextAction: 'Definir trigger objetivo e data de reavaliação da empresa',
    objective: 'Preservar a tese sem forçar avanço antes de evidência material de timing ou executabilidade.',
  },
  recycle: {
    label: 'Reciclar oportunidade',
    activityType: 'follow_up',
    requestedStage: 'Recycled',
    nextAction: 'Registrar motivo e janela objetiva de reabordagem',
    objective: 'Retirar a empresa da fila ativa, mantendo memória, condições de retorno e trigger de reativação.',
  },
  no_fit: {
    label: 'Não faz sentido',
    activityType: 'other',
    requestedStage: 'ClosedLost',
    nextAction: 'Registrar racional de não aderência e encerrar cobertura ativa',
    objective: 'Documentar a decisão negativa sem apagar evidências ou contaminar score e qualification.',
  },
};

const outcomeOptions: Array<{ value: KnowledgeOutcomeStatus; label: string }> = [
  { value: 'progress', label: 'Avanço / evidência nova' },
  { value: 'won', label: 'Resultado positivo' },
  { value: 'lost', label: 'Resultado negativo' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'no_change', label: 'Sem mudança material' },
];

const isDecisionBrief = (node: KnowledgeNodeSummary) => {
  const template = String(node.properties?.template ?? '');
  return node.nodeType === 'meeting'
    && (template.startsWith('company-decision-brief-v12') || node.title.startsWith('Briefing decisório'));
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'data inválida';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const toDateTimeLocal = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};

const defaultDueAt = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(12, 0, 0, 0);
  return toDateTimeLocal(date);
};

const toIso = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const createKey = (prefix: string, companyId: string, entityId: string) => {
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${companyId}:${entityId}:${token}`;
};

const resolveTargetStage = (
  currentStage: string | null | undefined,
  requestedStage: KnowledgePipelineStage | null,
): KnowledgePipelineStage | null => {
  if (!requestedStage) return null;
  if (requestedStage === 'ClosedLost' || requestedStage === 'Recycled') return requestedStage;
  const currentIndex = stageOrder.indexOf(currentStage as KnowledgePipelineStage);
  const requestedIndex = stageOrder.indexOf(requestedStage);
  if (currentIndex >= 0 && requestedIndex >= 0 && currentIndex > requestedIndex) return null;
  return requestedStage;
};

const blankOutcome = (companyId: string, activityId: string): OutcomeDraft => ({
  idempotencyKey: createKey('decision-outcome', companyId, activityId),
  outcomeStatus: 'progress',
  observedOutcome: '',
  confirmedFacts: '',
  remainingGaps: '',
  nextAction: '',
  dueAt: '',
  requestedStage: '',
});

export function CompanyDecisionActivationPanel({ companyId }: Props) {
  const { session } = useAuth();
  const [workspace, setWorkspace] = useState<KnowledgeCompanyWorkspace | null>(null);
  const [decisionCode, setDecisionCode] = useState<DecisionCode>('advance_diligence');
  const [rationale, setRationale] = useState('');
  const [nextAction, setNextAction] = useState(decisions.advance_diligence.nextAction);
  const [dueAt, setDueAt] = useState(defaultDueAt);
  const [confirmed, setConfirmed] = useState(false);
  const [outcomeDraft, setOutcomeDraft] = useState<OutcomeDraft | null>(null);
  const [outcomeConfirmed, setOutcomeConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activationResult, setActivationResult] = useState<KnowledgeExecutionWorkspace | null>(null);

  const load = useCallback(async () => {
    if (!companyId) throw new Error('Empresa inválida para ativar decisão.');
    const loaded = await knowledgeVaultApi.getCompanyWorkspace(session, companyId);
    setWorkspace(loaded);
  }, [companyId, session]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void load()
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar briefings e execução.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [load]);

  const latestBrief = useMemo(() => workspace?.nodes
    .filter(isDecisionBrief)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ?? null, [workspace?.nodes]);

  const briefExecutions = useMemo(() => latestBrief
    ? workspace?.execution.executions.filter((item) => item.nodeId === latestBrief.id) ?? []
    : [], [latestBrief, workspace?.execution.executions]);

  const openExecution = useMemo(
    () => briefExecutions.find((item) => item.status !== 'done') ?? null,
    [briefExecutions],
  );

  useEffect(() => {
    if (!openExecution) {
      setOutcomeDraft(null);
      setOutcomeConfirmed(false);
      return;
    }
    setOutcomeDraft((current) => current && current.idempotencyKey.includes(openExecution.activityId)
      ? current
      : blankOutcome(companyId, openExecution.activityId));
    setOutcomeConfirmed(false);
  }, [companyId, openExecution?.activityId]);

  const definition = decisions[decisionCode];
  const targetStage = resolveTargetStage(workspace?.pipeline?.stage, definition.requestedStage);
  const outcomeTargetStage = resolveTargetStage(
    workspace?.pipeline?.stage,
    outcomeDraft?.requestedStage || null,
  );

  const handleDecisionChange = (value: DecisionCode) => {
    setDecisionCode(value);
    setNextAction(decisions[value].nextAction);
    setConfirmed(false);
    setNotice(null);
    setActivationResult(null);
  };

  const activateDecision = async () => {
    if (!workspace || !latestBrief) return;
    if (openExecution) {
      setError('Este briefing já possui uma ação aberta. Registre o outcome antes de ativar uma nova decisão.');
      return;
    }
    if (!rationale.trim()) {
      setError('Registre o racional humano que sustenta a decisão.');
      return;
    }
    if (!nextAction.trim()) {
      setError('Defina a próxima ação operacional.');
      return;
    }
    if (!confirmed) {
      setError('Confirme a ativação antes de alterar CRM, task e pipeline.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await knowledgeVaultApi.createExecutionAction(session, {
        nodeId: latestBrief.id,
        idempotencyKey: createKey('decision-activation', companyId, latestBrief.id),
        activityType: definition.activityType,
        title: `Decisão do briefing: ${definition.label}`,
        description: [
          `Briefing-base: ${latestBrief.title}.`,
          `Objetivo: ${definition.objective}`,
          `Racional humano: ${rationale.trim()}`,
          'Guardrail: a ativação registra execução comercial; não recalcula qualification, patterns, score ou ranking.',
        ].join('\n\n'),
        nextAction: nextAction.trim(),
        dueAt: toIso(dueAt),
        targetStage,
      });
      setActivationResult(result);
      setNotice('Decisão ativada: activity, task, próxima ação e solicitação de estágio foram registradas com lineage.');
      setConfirmed(false);
      await load();
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : 'Falha ao ativar a decisão no CRM.');
    } finally {
      setBusy(false);
    }
  };

  const completeDecisionOutcome = async () => {
    if (!openExecution || !outcomeDraft) return;
    if (!outcomeDraft.observedOutcome.trim()) {
      setError('Descreva o resultado observado antes de concluir a decisão.');
      return;
    }
    if (!outcomeConfirmed) {
      setError('Confirme que o outcome representa o resultado observado e revisado por uma pessoa.');
      return;
    }

    const outcomeText = [
      `Resultado observado: ${outcomeDraft.observedOutcome.trim()}`,
      outcomeDraft.confirmedFacts.trim() ? `Fatos confirmados: ${outcomeDraft.confirmedFacts.trim()}` : null,
      outcomeDraft.remainingGaps.trim() ? `Lacunas remanescentes: ${outcomeDraft.remainingGaps.trim()}` : null,
      `Briefing-base: ${latestBrief?.title ?? openExecution.nodeTitle}.`,
      `Ação de origem: ${openExecution.title}.`,
      'Guardrail: este registro descreve outcome operacional observado; não altera qualification, patterns, score ou ranking.',
    ].filter(Boolean).join('\n\n');

    setOutcomeBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await knowledgeVaultApi.completeExecutionAction(session, {
        activityId: openExecution.activityId,
        idempotencyKey: outcomeDraft.idempotencyKey,
        outcomeStatus: outcomeDraft.outcomeStatus,
        outcome: outcomeText,
        nextAction: outcomeDraft.nextAction.trim() || null,
        dueAt: toIso(outcomeDraft.dueAt),
        targetStage: outcomeTargetStage,
      });
      setActivationResult(result);
      setNotice('Outcome registrado: ação concluída, tarefa anterior fechada e próximo passo atualizado com lineage.');
      setOutcomeConfirmed(false);
      await load();
    } catch (outcomeError) {
      setError(outcomeError instanceof Error ? outcomeError.message : 'Falha ao registrar o outcome da decisão.');
    } finally {
      setOutcomeBusy(false);
    }
  };

  return (
    <Card
      title="Ativação da decisão"
      subtitle="Converte briefing em execução e fecha o ciclo com outcome observado no pipeline existente"
      tone="accent"
      className="dense-card company-decision-activation-card"
    >
      <div className="company-decision-activation-head">
        <div className="pill-row">
          <Pill tone="success">briefing → execução → outcome</Pill>
          <Pill tone="default">sem mutação de score</Pill>
          <Pill tone={openExecution ? 'warning' : 'info'}>{openExecution ? 'outcome pendente' : 'pronto para ativar'}</Pill>
        </div>
        <Link className="button secondary compact-button" to="/knowledge-vault">Abrir Vault</Link>
      </div>

      {loading ? <p className="table-helper">Carregando briefing validado, pipeline, ações e outcomes vinculados...</p> : null}
      {error ? <div className="data-banner data-banner-warning" role="alert"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {notice ? <div className="data-banner data-banner-success" role="status"><Pill tone="success">ok</Pill><span>{notice}</span></div> : null}

      {!loading && workspace && latestBrief ? (
        <>
          <div className="mini-metric-grid company-decision-activation-metrics">
            <Stat label="Briefing-base" value={latestBrief.title} helper={`atualizado ${formatDate(latestBrief.updatedAt)}`} />
            <Stat label="Estágio atual" value={workspace.pipeline?.stage ?? 'Fora do pipeline'} helper={workspace.pipeline?.status ?? 'sem status'} />
            <Stat label="Próxima ação atual" value={workspace.pipeline?.nextAction ?? 'Não definida'} helper={formatDate(workspace.pipeline?.nextActionDueAt)} />
            <Stat label="Execuções do briefing" value={String(briefExecutions.length)} helper={`${briefExecutions.filter((item) => item.status === 'done').length} concluídas`} />
          </div>

          {openExecution && outcomeDraft ? (
            <>
              <div className="company-decision-open-action">
                <div>
                  <span className="section-label">Ação aguardando resultado</span>
                  <strong>{openExecution.title}</strong>
                  <p>{openExecution.description || 'Sem descrição registrada.'}</p>
                  <small>Próxima ação: {openExecution.taskTitle || openExecution.actualNextAction || 'não definida'} · prazo {formatDate(openExecution.dueAt)}</small>
                </div>
                <Pill tone="warning">registre o outcome</Pill>
              </div>

              <div className="company-decision-outcome-form">
                <label>
                  <span>Classificação do resultado</span>
                  <select value={outcomeDraft.outcomeStatus} onChange={(event) => { setOutcomeDraft({ ...outcomeDraft, outcomeStatus: event.target.value as KnowledgeOutcomeStatus }); setOutcomeConfirmed(false); }}>
                    {outcomeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>

                <label>
                  <span>Estágio solicitado</span>
                  <select value={outcomeDraft.requestedStage} onChange={(event) => { setOutcomeDraft({ ...outcomeDraft, requestedStage: event.target.value as OutcomeDraft['requestedStage'] }); setOutcomeConfirmed(false); }}>
                    <option value="">Manter estágio atual</option>
                    {stageOrder.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                  </select>
                  {outcomeDraft.requestedStage && !outcomeTargetStage ? <small>Movimento regressivo bloqueado; o estágio atual será preservado.</small> : null}
                </label>

                <label className="company-decision-activation-wide">
                  <span>Resultado observado</span>
                  <textarea rows={4} value={outcomeDraft.observedOutcome} onChange={(event) => { setOutcomeDraft({ ...outcomeDraft, observedOutcome: event.target.value }); setOutcomeConfirmed(false); }} placeholder="O que aconteceu na conversa, diligência, análise ou comitê? Registre apenas fatos observados e conclusões explicitamente validadas." />
                </label>

                <label className="company-decision-activation-wide">
                  <span>Fatos confirmados</span>
                  <textarea rows={3} value={outcomeDraft.confirmedFacts} onChange={(event) => { setOutcomeDraft({ ...outcomeDraft, confirmedFacts: event.target.value }); setOutcomeConfirmed(false); }} placeholder="Ex.: volume de recebíveis, prazo, concentração, funding atual, sponsor, ticket ou cronograma confirmados." />
                </label>

                <label className="company-decision-activation-wide">
                  <span>Lacunas remanescentes</span>
                  <textarea rows={3} value={outcomeDraft.remainingGaps} onChange={(event) => { setOutcomeDraft({ ...outcomeDraft, remainingGaps: event.target.value }); setOutcomeConfirmed(false); }} placeholder="O que ainda não foi provado, quais documentos faltam e quais riscos permanecem?" />
                </label>

                <label>
                  <span>Próxima ação</span>
                  <input value={outcomeDraft.nextAction} onChange={(event) => { setOutcomeDraft({ ...outcomeDraft, nextAction: event.target.value }); setOutcomeConfirmed(false); }} placeholder="Opcional; cria follow-up e atualiza o pipeline" />
                </label>

                <label>
                  <span>Prazo do próximo passo</span>
                  <input type="datetime-local" value={outcomeDraft.dueAt} onChange={(event) => { setOutcomeDraft({ ...outcomeDraft, dueAt: event.target.value }); setOutcomeConfirmed(false); }} />
                </label>

                <div className="company-decision-activation-footer company-decision-activation-wide">
                  <label className="company-decision-activation-confirmation">
                    <input type="checkbox" checked={outcomeConfirmed} onChange={(event) => setOutcomeConfirmed(event.target.checked)} />
                    Confirmo que este outcome representa o resultado observado, separa fatos de lacunas e pode concluir a activity, fechar a task anterior e criar o follow-up informado.
                  </label>
                  <button type="button" disabled={outcomeBusy || !outcomeConfirmed || !outcomeDraft.observedOutcome.trim()} onClick={() => void completeDecisionOutcome()}>
                    {outcomeBusy ? 'Registrando...' : 'Registrar outcome da decisão'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="company-decision-activation-form">
              <label>
                <span>Decisão humana</span>
                <select value={decisionCode} onChange={(event) => handleDecisionChange(event.target.value as DecisionCode)}>
                  {(Object.entries(decisions) as Array<[DecisionCode, DecisionDefinition]>).map(([code, item]) => (
                    <option key={code} value={code}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Estágio solicitado</span>
                <input value={targetStage ?? 'Manter estágio atual'} readOnly />
                {definition.requestedStage && !targetStage ? <small>Movimento regressivo bloqueado; o estágio atual será preservado.</small> : null}
              </label>

              <label className="company-decision-activation-wide">
                <span>Próxima ação</span>
                <input value={nextAction} onChange={(event) => { setNextAction(event.target.value); setConfirmed(false); }} />
              </label>

              <label>
                <span>Prazo</span>
                <input type="datetime-local" value={dueAt} onChange={(event) => { setDueAt(event.target.value); setConfirmed(false); }} />
              </label>

              <label className="company-decision-activation-wide">
                <span>Racional humano da decisão</span>
                <textarea rows={4} value={rationale} onChange={(event) => { setRationale(event.target.value); setConfirmed(false); }} placeholder="Registre o que foi validado, quais evidências sustentam a decisão e quais lacunas permanecem." />
              </label>

              <div className="company-decision-activation-objective company-decision-activation-wide">
                <span className="section-label">Resultado esperado</span>
                <p>{definition.objective}</p>
              </div>

              <div className="company-decision-activation-footer company-decision-activation-wide">
                <label className="company-decision-activation-confirmation">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  Confirmo que esta decisão foi revisada por uma pessoa e pode criar activity, task, próxima ação e solicitação de estágio.
                </label>
                <button type="button" disabled={busy || !confirmed || !rationale.trim() || !nextAction.trim()} onClick={() => void activateDecision()}>
                  {busy ? 'Ativando...' : 'Ativar decisão no CRM'}
                </button>
              </div>
            </div>
          )}

          {activationResult ? (
            <div className="company-decision-activation-result">
              <Stat label="Estágio efetivo" value={activationResult.pipeline?.stage ?? 'Fora do pipeline'} helper="resultado após guardrails" />
              <Stat label="Tasks abertas" value={String(activationResult.openTaskCount)} helper="originadas pelo Vault" />
              <Stat label="Próxima ação efetiva" value={activationResult.pipeline?.nextAction ?? 'Não definida'} helper={formatDate(activationResult.pipeline?.nextActionDueAt)} />
            </div>
          ) : null}

          {briefExecutions.length ? (
            <div className="company-decision-activation-history">
              <span className="section-label">Histórico ligado ao briefing</span>
              {briefExecutions.slice(0, 4).map((item) => (
                <article key={item.activityId}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.status} · {item.outcomeStatus ?? 'sem outcome'} · {formatDate(item.occurredAt)}</small>
                  </div>
                  <Pill tone={item.status === 'done' ? 'success' : 'info'}>{item.status === 'done' ? 'concluída' : 'aberta'}</Pill>
                </article>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && workspace && !latestBrief ? (
        <EmptyState title="Nenhum briefing decisório validado." description="Gere, revise e salve o briefing acima. A ativação só usa uma nota versionada vinculada à empresa." />
      ) : null}

      {!loading && !workspace && !error ? (
        <EmptyState title="Contexto indisponível." description="Confirme a sessão autenticada e o Company Master antes de ativar uma decisão." />
      ) : null}
    </Card>
  );
}
