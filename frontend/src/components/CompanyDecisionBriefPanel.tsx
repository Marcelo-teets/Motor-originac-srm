import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Pill } from './UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { knowledgeVaultApi } from '../lib/knowledgeVaultApi';
import type {
  KnowledgeActivityType,
  KnowledgeCompanyWorkspace,
  KnowledgeNodeDetail,
} from '../lib/knowledgeVaultTypes';
import type { DataSourceKind, PreCallBriefing } from '../lib/types';
import '../styles/company-decision-brief.css';

type CompanyDecisionBriefPanelProps = {
  companyId: string;
  onKnowledgeChanged?: () => void;
};

type PreCallState = {
  data: PreCallBriefing | null;
  source: DataSourceKind | 'unavailable';
};

type ExecutionDraft = {
  idempotencyKey: string;
  activityType: KnowledgeActivityType;
  title: string;
  description: string;
  nextAction: string;
  dueAt: string;
};

const executionTypes: Array<{ value: KnowledgeActivityType; label: string }> = [
  { value: 'meeting', label: 'Reunião realizada / em andamento' },
  { value: 'follow_up', label: 'Follow-up / preparação' },
  { value: 'call', label: 'Ligação' },
  { value: 'email', label: 'E-mail' },
];

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'data inválida — revisar';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
};

const clean = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;

const normalizePercent = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return 'não informada';
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(Math.max(0, Math.min(100, normalized)))}%`;
};

const preCallSourceLabel = (source: PreCallState['source']) => {
  if (source === 'real') return 'backend ABM real';
  if (source === 'partial') return 'backend ABM parcial';
  if (source === 'mock') return 'fallback ABM mock — validar';
  return 'ABM indisponível — validar manualmente';
};

const createKey = (prefix: string) => {
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${token}`;
};

const toIso = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function buildDecisionBrief(workspace: KnowledgeCompanyWorkspace, preCallState: PreCallState) {
  const qualification = workspace.latestQualification;
  const signals = workspace.signals.slice(0, 5);
  const outputs = workspace.monitoringOutputs.slice(0, 5);
  const notes = workspace.nodes.slice(0, 5);
  const pipeline = workspace.pipeline;
  const preCall = preCallState.data;

  const signalLines = signals.length
    ? signals.map((signal) => `- ${signal.label}: ${clean(signal.evidenceText, signal.type.replace(/_/g, ' '))} (força ${normalizePercent(signal.strength)}, confiança ${normalizePercent(signal.confidence)}, ${signal.isExplicit ? 'explícito' : 'inferido'})`).join('\n')
    : '- Nenhum sinal consolidado. Validar fontes e executar monitoramento antes da abordagem.';

  const outputLines = outputs.length
    ? outputs.map((output) => `- ${clean(output.title, output.outputType.replace(/_/g, ' '))}: ${clean(output.summary, 'sem resumo textual')} — ${clean(output.sourceName, 'fonte não identificada')} (${output.observedVsInferred}, ${formatDate(output.observedAt)})`).join('\n')
    : '- Nenhum output recente disponível.';

  const noteLines = notes.length
    ? notes.map((note) => `- [[${note.title}]] — ${note.nodeType}, ${note.referenceCount ?? 0} evidências`).join('\n')
    : '- Nenhuma nota anterior vinculada à empresa.';

  const stakeholderLines = preCall?.stakeholders.length
    ? preCall.stakeholders.slice(0, 5).map((stakeholder) => `- ${stakeholder.name} — ${clean(stakeholder.title, stakeholder.role_in_buying_committee || 'papel não informado')}; influência ${normalizePercent(stakeholder.influence_score)}; champion ${normalizePercent(stakeholder.champion_score)}; blocker ${normalizePercent(stakeholder.blocker_score)}.`).join('\n')
    : '- Buying committee ainda não consolidado.';

  const touchpointLines = preCall?.recent_touchpoints.length
    ? preCall.recent_touchpoints.slice(0, 5).map((touchpoint) => `- ${formatDate(touchpoint.occurred_at)} · ${touchpoint.channel}: ${touchpoint.summary}${touchpoint.agreed_next_step ? ` · próximo passo acordado: ${touchpoint.agreed_next_step}` : ''}`).join('\n')
    : '- Nenhum touchpoint recente registrado.';

  const objectionLines = preCall?.open_objections.length
    ? preCall.open_objections.slice(0, 5).map((objection) => `- ${objection.severity || 'severidade não informada'} · ${objection.objection_text} (${objection.status})`).join('\n')
    : '- Nenhuma objeção aberta registrada.';

  const riskLines = preCall?.conversation_risks.length
    ? preCall.conversation_risks.slice(0, 6).map((risk) => `- ${risk}`).join('\n')
    : '- Mapear riscos de timing, sponsor, alternativa bancária, governança, garantias e capacidade de reporte.';

  const whyNow = clean(
    preCall?.why_now,
    signals[0]?.evidenceText || outputs[0]?.summary || 'Não há trigger recente suficientemente consolidado. Tratar timing como hipótese até validação.',
  );

  const recommendedNextStep = clean(
    preCall?.recommended_next_step,
    qualification?.nextAction || pipeline?.nextAction || 'Validar evidências críticas e definir sponsor, mensagem e CTA da abordagem.',
  );

  return `# Briefing decisório — ${workspace.company.name}

> Rascunho gerado a partir do estado atual do Company Master, Qualification, Signals, Monitoring, Pipeline, ABM e Knowledge Vault. Revisão humana obrigatória antes de uso comercial ou em comitê.

## 0. Governança do snapshot
- Origem do contexto ABM: ${preCallSourceLabel(preCallState.source)}
- Qualification snapshot: ${qualification?.id || 'não disponível'}
- Pipeline snapshot: ${pipeline?.id || 'não disponível'}
- Regra: fatos observados, inferências e lacunas devem permanecer separados.
- Regra: relevância semântica, força de sinal e score não constituem decisão de crédito.

## 1. Resumo executivo
- Empresa: ${workspace.company.name}
- CNPJ: ${clean(workspace.company.cnpj, 'não informado')}
- Estágio da empresa: ${clean(workspace.company.stage, 'não informado')}
- Estágio no pipeline: ${clean(pipeline?.stage, 'não informado')}
- Prioridade comercial: ${clean(pipeline?.priority, 'não informada')}
- Resumo institucional ABM: ${clean(preCall?.institutional_summary, 'não disponível — validar Company Master e fontes primárias')}
- Tese comercial ABM: ${clean(preCall?.thesis, 'não disponível — construir após validação')}

## 2. Diagnóstico de crédito
- Qualification score: ${qualification?.totalScore == null ? 'não calculado' : Math.round(qualification.totalScore)}
- Funding need score: ${qualification?.fundingNeedScore == null ? 'não calculado' : Math.round(qualification.fundingNeedScore)}
- Urgência: ${qualification?.urgencyScore == null ? 'não calculada' : Math.round(qualification.urgencyScore)}
- Funding gap: ${clean(qualification?.fundingGapLevel, 'em validação')}
- Fit FIDC: ${qualification?.fitFidc == null ? 'em validação' : qualification.fitFidc ? 'sim' : 'não'}
- Fit DCM: ${qualification?.fitDcm == null ? 'em validação' : qualification.fitDcm ? 'sim' : 'não'}
- Estrutura sugerida: ${clean(qualification?.suggestedStructure, pipeline?.expectedStructure || 'em avaliação')}

### Rationale atual
${clean(qualification?.capitalStructureRationale, 'Ainda não há rationale consolidado. Validar estrutura de capital, recebíveis, funding atual e uso de recursos.')}

## 3. Por que agora
${whyNow}

> Classificação inicial: hipótese de timing. Confirmar data, fonte primária, materialidade financeira e relação causal antes da abordagem.

## 4. Evidências prioritárias
### Sinais
${signalLines}

### Outputs de monitoramento
${outputLines}

## 5. Hipótese de estrutura
- Produto preliminar: ${clean(qualification?.suggestedStructure, pipeline?.expectedStructure || 'em avaliação')}
- Ticket esperado: ${pipeline?.expectedTicket == null ? 'não informado' : `R$ ${Number(pipeline.expectedTicket).toLocaleString('pt-BR')}`}
- Pontos a validar: natureza e recorrência dos recebíveis; concentração; prazo médio; performance histórica; estrutura de funding atual; garantias; governança; capacidade de reporte.

## 6. Buying committee e contexto comercial
### Stakeholders
${stakeholderLines}

### Touchpoints recentes
${touchpointLines}

### Objeções abertas
${objectionLines}

### Riscos de conversa
${riskLines}

## 7. Riscos e lacunas de crédito
- Separar fatos observados, inferências e dados ausentes.
- Confirmar evidências nas fontes primárias antes de abordagem ou comitê.
- Não tratar relevância semântica, força de sinal ou score como decisão de crédito isolada.
- Verificar eventuais ônus, cessões, covenants e conflitos com financiadores atuais.
- Confirmar volume elegível, histórico de performance, concentração, prazo médio e capacidade de reporte.

## 8. Próxima ação recomendada
${recommendedNextStep}

- Prazo atual: ${formatDate(pipeline?.nextActionDueAt)}
- CTA sugerido: ${clean(preCall?.suggested_cta, 'Validar janela de funding, estrutura aderente e sponsor financeiro da operação.')}
- Owner: definir responsável comercial.
- Resultado esperado: confirmar funding gap, ativo financiável, estrutura aderente e janela de execução.

## 9. Memória relacionada
${noteLines}

## 10. Perguntas para reunião
1. Qual necessidade de capital está crescendo e por quê?
2. Como a empresa financia hoje carteira, recebíveis, clientes, fornecedores ou expansão?
3. Qual é o volume, prazo, concentração e performance dos ativos potencialmente financiáveis?
4. Há dívida estruturada, FIDC, cessão, trava bancária ou covenant já existente?
5. Qual uso de recursos, ticket e cronograma fariam sentido?
6. Quem patrocina internamente a operação e qual processo de decisão?
7. Quais dados e documentos podem ser compartilhados para validar a hipótese de estrutura?

## 11. Decisão pós-conversa
- [ ] Avançar diligência
- [ ] Estruturar alternativa FIDC
- [ ] Estruturar alternativa DCM
- [ ] Manter em monitoramento
- [ ] Reciclar
- [ ] Não faz sentido

### Evidências adicionais / decisão
Preencher após a conversa.
`;
}

export function CompanyDecisionBriefPanel({ companyId, onKnowledgeChanged }: CompanyDecisionBriefPanelProps) {
  const { session } = useAuth();
  const [workspace, setWorkspace] = useState<KnowledgeCompanyWorkspace | null>(null);
  const [preCallState, setPreCallState] = useState<PreCallState>({ data: null, source: 'unavailable' });
  const [draft, setDraft] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [executionDraft, setExecutionDraft] = useState<ExecutionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionNotice, setExecutionNotice] = useState<string | null>(null);
  const [savedNode, setSavedNode] = useState<KnowledgeNodeDetail | null>(null);

  const load = useCallback(async () => {
    if (!companyId) throw new Error('Empresa inválida para gerar o briefing.');

    const [loadedWorkspace, preCallEnvelope] = await Promise.all([
      knowledgeVaultApi.getCompanyWorkspace(session, companyId),
      api.getPreCallBriefing(session, companyId).catch(() => null),
    ]);
    const loadedPreCall: PreCallState = preCallEnvelope
      ? { data: preCallEnvelope.data, source: preCallEnvelope.status }
      : { data: null, source: 'unavailable' };

    setWorkspace(loadedWorkspace);
    setPreCallState(loadedPreCall);
    setDraft(buildDecisionBrief(loadedWorkspace, loadedPreCall));
    setConfirmed(false);
    setSavedNode(null);
    setHandoffOpen(false);
    setExecutionDraft(null);
    setExecutionNotice(null);
  }, [companyId, session]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void load()
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Falha ao preparar briefing.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [load]);

  const evidenceCount = useMemo(() => {
    if (!workspace) return 0;
    return Math.min(workspace.signals.length, 5)
      + Math.min(workspace.monitoringOutputs.length, 5)
      + workspace.nodes.slice(0, 5).reduce((sum, node) => sum + (node.referenceCount ?? 0), 0)
      + Math.min(preCallState.data?.stakeholders.length ?? 0, 5)
      + Math.min(preCallState.data?.recent_touchpoints.length ?? 0, 5)
      + Math.min(preCallState.data?.open_objections.length ?? 0, 5);
  }, [preCallState.data, workspace]);

  const saveBrief = async () => {
    if (!workspace || !confirmed || !draft.trim()) return;
    setSaving(true);
    setError(null);
    setExecutionNotice(null);
    try {
      const today = new Intl.DateTimeFormat('pt-BR').format(new Date());
      const saved = await knowledgeVaultApi.saveNode(session, {
        title: `Briefing decisório — ${workspace.company.name} — ${today}`,
        nodeType: 'meeting',
        contentMarkdown: draft.trim(),
        tags: ['briefing', 'origination', 'decision', 'human-reviewed'],
        properties: {
          template: 'company-decision-brief-v12',
          generatedAt: new Date().toISOString(),
          humanConfirmed: true,
          evidenceCount,
          qualificationSnapshotId: workspace.latestQualification?.id ?? null,
          pipelineId: workspace.pipeline?.id ?? null,
          abmPreCallSource: preCallState.source,
          abmPreCallIncluded: Boolean(preCallState.data),
          scoreMutation: false,
        },
        companyId,
        visibility: 'team',
      });
      setSavedNode(saved);
      setConfirmed(false);
      setHandoffOpen(false);
      setExecutionDraft(null);
      onKnowledgeChanged?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar briefing no Vault.');
    } finally {
      setSaving(false);
    }
  };

  const openExecutionHandoff = () => {
    if (!workspace || !savedNode) return;
    const nextAction = preCallState.data?.recommended_next_step
      || workspace.latestQualification?.nextAction
      || workspace.pipeline?.nextAction
      || '';
    const cta = preCallState.data?.suggested_cta
      || 'Validar funding gap, ativo financiável, sponsor e janela de execução.';

    setExecutionDraft({
      idempotencyKey: createKey(`brief-execution:${savedNode.node.id}`),
      activityType: 'follow_up',
      title: `Preparar abordagem — ${workspace.company.name}`,
      description: `Ação originada do briefing revisado "${savedNode.node.title}". Objetivo comercial: ${cta}`,
      nextAction,
      dueAt: '',
    });
    setExecutionNotice(null);
    setError(null);
    setHandoffOpen(true);
  };

  const submitExecutionHandoff = async () => {
    if (!savedNode || !executionDraft) return;
    if (!executionDraft.title.trim()) {
      setError('Informe o título da ação antes de enviar o briefing para execução.');
      return;
    }

    setExecuting(true);
    setError(null);
    setExecutionNotice(null);
    try {
      await knowledgeVaultApi.createExecutionAction(session, {
        nodeId: savedNode.node.id,
        idempotencyKey: executionDraft.idempotencyKey,
        activityType: executionDraft.activityType,
        title: executionDraft.title.trim(),
        description: executionDraft.description.trim() || null,
        nextAction: executionDraft.nextAction.trim() || null,
        dueAt: toIso(executionDraft.dueAt),
        targetStage: null,
      });
      setExecutionNotice('Ação criada no CRM real e vinculada ao briefing. O resultado será registrado na Execução da tese / Outcome Workbench.');
      setHandoffOpen(false);
      setExecutionDraft(null);
      onKnowledgeChanged?.();
    } catch (executionError) {
      setError(executionError instanceof Error ? executionError.message : 'Falha ao enviar o briefing para execução.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Card title="Briefing decisório" subtitle="Transforma contexto real da empresa em preparação de reunião e registro auditável" tone="accent" className="dense-card company-decision-brief-card">
      <div className="company-decision-brief-header">
        <div className="pill-row">
          <Pill tone="info">{workspace?.signals.length ?? 0} sinais</Pill>
          <Pill tone="success">{workspace?.monitoringOutputs.length ?? 0} outputs</Pill>
          <Pill tone="warning">{evidenceCount} itens no snapshot</Pill>
          <Pill tone={preCallState.source === 'real' ? 'success' : preCallState.source === 'unavailable' ? 'warning' : 'info'}>ABM {preCallState.source}</Pill>
          <Pill tone="default">não altera score</Pill>
        </div>
        <button type="button" className="secondary compact-button" disabled={loading} onClick={() => void load()}>Regerar do estado atual</button>
      </div>

      {loading ? <p className="table-helper">Consolidando Company Master, Qualification, Signals, Monitoring, Pipeline, ABM e memória...</p> : null}
      {error ? <div className="data-banner data-banner-warning" role="alert"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {executionNotice ? <div className="data-banner data-banner-success" role="status"><Pill tone="success">execução</Pill><span>{executionNotice}</span><a href="#bloco-knowledge">Ver execução</a></div> : null}
      {savedNode ? (
        <div className="data-banner data-banner-success company-decision-saved-banner" role="status">
          <Pill tone="success">salvo</Pill>
          <span>Briefing registrado como nota versionada e vinculado à empresa.</span>
          <div className="actions">
            <Link to="/knowledge-vault">Abrir Vault</Link>
            <button type="button" className="secondary compact-button" onClick={openExecutionHandoff}>Enviar para execução</button>
          </div>
        </div>
      ) : null}

      {handoffOpen && executionDraft ? (
        <section className="company-decision-handoff" aria-label="Handoff do briefing para execução">
          <div className="company-decision-handoff-head">
            <div>
              <span className="section-label">Handoff V13</span>
              <h4>Briefing → ação rastreável</h4>
              <p>Revise a ação. Estágio não será alterado; o prazo abaixo é apenas do próximo passo.</p>
            </div>
            <Pill tone="info">idempotente</Pill>
          </div>
          <div className="company-decision-handoff-grid">
            <label>
              <span>Tipo de ação</span>
              <select value={executionDraft.activityType} onChange={(event) => setExecutionDraft({ ...executionDraft, activityType: event.target.value as KnowledgeActivityType })}>
                {executionTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="company-decision-handoff-wide">
              <span>Título</span>
              <input value={executionDraft.title} onChange={(event) => setExecutionDraft({ ...executionDraft, title: event.target.value })} />
            </label>
            <label className="company-decision-handoff-wide">
              <span>Contexto / objetivo</span>
              <textarea rows={3} value={executionDraft.description} onChange={(event) => setExecutionDraft({ ...executionDraft, description: event.target.value })} />
            </label>
            <label>
              <span>Próxima ação no pipeline</span>
              <input value={executionDraft.nextAction} onChange={(event) => setExecutionDraft({ ...executionDraft, nextAction: event.target.value })} placeholder="Opcional; será aplicada somente após este clique" />
            </label>
            <label>
              <span>Prazo do próximo passo</span>
              <input type="datetime-local" value={executionDraft.dueAt} onChange={(event) => setExecutionDraft({ ...executionDraft, dueAt: event.target.value })} />
            </label>
          </div>
          <div className="company-decision-handoff-actions">
            <small>Nenhum score, pattern, qualification ou estágio será alterado. A ação e o briefing permanecem ligados por lineage.</small>
            <div className="actions">
              <button type="button" className="secondary" disabled={executing} onClick={() => { setHandoffOpen(false); setExecutionDraft(null); }}>Cancelar</button>
              <button type="button" disabled={executing || !executionDraft.title.trim()} onClick={() => void submitExecutionHandoff()}>{executing ? 'Criando...' : 'Criar ação rastreável'}</button>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && workspace ? <>
        <textarea className="company-decision-brief-editor" value={draft} onChange={(event) => { setDraft(event.target.value); setSavedNode(null); setConfirmed(false); setHandoffOpen(false); setExecutionDraft(null); setExecutionNotice(null); }} aria-label="Briefing decisório editável" />
        <div className="company-decision-brief-footer">
          <label className="company-decision-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Revisei fatos, inferências, lacunas, contexto ABM e fontes antes de salvar.</label>
          <button type="button" disabled={!confirmed || !draft.trim() || saving} onClick={() => void saveBrief()}>{saving ? 'Salvando...' : 'Salvar briefing no Vault'}</button>
        </div>
      </> : null}
      {!loading && !workspace && !error ? <EmptyState title="Contexto indisponível." description="Recarregue a empresa e confirme que há sessão autenticada e dados reais no Company Master." /> : null}
    </Card>
  );
}
