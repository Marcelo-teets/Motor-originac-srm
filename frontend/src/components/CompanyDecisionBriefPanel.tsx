import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Pill } from './UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { knowledgeVaultApi } from '../lib/knowledgeVaultApi';
import type { KnowledgeCompanyWorkspace, KnowledgeNodeDetail } from '../lib/knowledgeVaultTypes';
import type { DataSourceKind, PreCallBriefing } from '../lib/types';
import '../styles/company-decision-brief.css';

type CompanyDecisionBriefPanelProps = {
  companyId: string;
};

type PreCallState = {
  data: PreCallBriefing | null;
  source: DataSourceKind | 'unavailable';
};

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

function buildDecisionBrief(
  workspace: KnowledgeCompanyWorkspace,
  preCallState: PreCallState,
) {
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

export function CompanyDecisionBriefPanel({ companyId }: CompanyDecisionBriefPanelProps) {
  const { session } = useAuth();
  const [workspace, setWorkspace] = useState<KnowledgeCompanyWorkspace | null>(null);
  const [preCallState, setPreCallState] = useState<PreCallState>({ data: null, source: 'unavailable' });
  const [draft, setDraft] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar briefing no Vault.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Briefing decisório"
      subtitle="Transforma contexto real da empresa em preparação de reunião e registro auditável"
      tone="accent"
      className="dense-card company-decision-brief-card"
    >
      <div className="company-decision-brief-header">
        <div className="pill-row">
          <Pill tone="info">{workspace?.signals.length ?? 0} sinais</Pill>
          <Pill tone="success">{workspace?.monitoringOutputs.length ?? 0} outputs</Pill>
          <Pill tone="warning">{evidenceCount} itens no snapshot</Pill>
          <Pill tone={preCallState.source === 'real' ? 'success' : preCallState.source === 'unavailable' ? 'warning' : 'info'}>
            ABM {preCallState.source}
          </Pill>
          <Pill tone="default">não altera score</Pill>
        </div>
        <button type="button" className="secondary compact-button" disabled={loading} onClick={() => void load()}>
          Regerar do estado atual
        </button>
      </div>

      {loading ? <p className="table-helper">Consolidando Company Master, Qualification, Signals, Monitoring, Pipeline, ABM e memória...</p> : null}
      {error ? <div className="data-banner data-banner-warning" role="alert"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {savedNode ? (
        <div className="data-banner data-banner-success" role="status">
          <Pill tone="success">salvo</Pill>
          <span>Briefing registrado como nota versionada e vinculado à empresa.</span>
          <Link to="/knowledge-vault">Abrir Vault</Link>
        </div>
      ) : null}

      {!loading && workspace ? (
        <>
          <textarea
            className="company-decision-brief-editor"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setSavedNode(null);
              setConfirmed(false);
            }}
            aria-label="Briefing decisório editável"
          />
          <div className="company-decision-brief-footer">
            <label className="company-decision-confirmation">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              Revisei fatos, inferências, lacunas, contexto ABM e fontes antes de salvar.
            </label>
            <button type="button" disabled={!confirmed || !draft.trim() || saving} onClick={() => void saveBrief()}>
              {saving ? 'Salvando...' : 'Salvar briefing no Vault'}
            </button>
          </div>
        </>
      ) : null}

      {!loading && !workspace && !error ? (
        <EmptyState title="Contexto indisponível." description="Recarregue a empresa e confirme que há sessão autenticada e dados reais no Company Master." />
      ) : null}
    </Card>
  );
}
