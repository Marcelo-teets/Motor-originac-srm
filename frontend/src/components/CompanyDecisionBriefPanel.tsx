import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, Pill } from './UI';
import { useAuth } from '../lib/auth';
import { knowledgeVaultApi } from '../lib/knowledgeVaultApi';
import type { KnowledgeCompanyWorkspace, KnowledgeNodeDetail } from '../lib/knowledgeVaultTypes';
import '../styles/company-decision-brief.css';

type CompanyDecisionBriefPanelProps = {
  companyId: string;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'não informado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
};

const clean = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;

function buildDecisionBrief(workspace: KnowledgeCompanyWorkspace) {
  const qualification = workspace.latestQualification;
  const signals = workspace.signals.slice(0, 5);
  const outputs = workspace.monitoringOutputs.slice(0, 5);
  const notes = workspace.nodes.slice(0, 5);
  const pipeline = workspace.pipeline;

  const signalLines = signals.length
    ? signals.map((signal) => `- ${signal.label}: ${clean(signal.evidenceText, signal.type.replace(/_/g, ' '))} (força ${Math.round(signal.strength)}, confiança ${Math.round(signal.confidence <= 1 ? signal.confidence * 100 : signal.confidence)}%, ${signal.isExplicit ? 'explícito' : 'inferido'})`).join('\n')
    : '- Nenhum sinal consolidado. Validar fontes e executar monitoramento antes da abordagem.';

  const outputLines = outputs.length
    ? outputs.map((output) => `- ${clean(output.title, output.outputType.replace(/_/g, ' '))}: ${clean(output.summary, 'sem resumo textual')} — ${clean(output.sourceName, 'fonte não identificada')} (${output.observedVsInferred}, ${formatDate(output.observedAt)})`).join('\n')
    : '- Nenhum output recente disponível.';

  const noteLines = notes.length
    ? notes.map((note) => `- [[${note.title}]] — ${note.nodeType}, ${note.referenceCount ?? 0} evidências`).join('\n')
    : '- Nenhuma nota anterior vinculada à empresa.';

  return `# Briefing decisório — ${workspace.company.name}

> Rascunho gerado a partir do estado atual do Company Master, Qualification, Signals, Monitoring, Pipeline e Knowledge Vault. Revisão humana obrigatória antes de uso comercial ou em comitê.

## 1. Resumo executivo
- Empresa: ${workspace.company.name}
- CNPJ: ${clean(workspace.company.cnpj, 'não informado')}
- Estágio da empresa: ${clean(workspace.company.stage, 'não informado')}
- Estágio no pipeline: ${clean(pipeline?.stage, 'não informado')}
- Prioridade comercial: ${clean(pipeline?.priority, 'não informada')}

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
${signals[0]?.evidenceText || outputs[0]?.summary || 'Não há trigger recente suficientemente consolidado. Tratar timing como hipótese até validação.'}

## 4. Evidências prioritárias
### Sinais
${signalLines}

### Outputs de monitoramento
${outputLines}

## 5. Hipótese de estrutura
- Produto preliminar: ${clean(qualification?.suggestedStructure, pipeline?.expectedStructure || 'em avaliação')}
- Ticket esperado: ${pipeline?.expectedTicket == null ? 'não informado' : `R$ ${Number(pipeline.expectedTicket).toLocaleString('pt-BR')}`}
- Pontos a validar: natureza e recorrência dos recebíveis; concentração; prazo médio; performance histórica; estrutura de funding atual; garantias; governança; capacidade de reporte.

## 6. Riscos e lacunas
- Separar fatos observados, inferências e dados ausentes.
- Confirmar evidências nas fontes primárias antes de abordagem ou comitê.
- Não tratar relevância semântica, força de sinal ou score como decisão de crédito isolada.
- Verificar eventuais ônus, cessões, covenants e conflitos com financiadores atuais.

## 7. Próxima ação recomendada
${clean(qualification?.nextAction, pipeline?.nextAction || 'Validar evidências críticas e definir sponsor, mensagem e CTA da abordagem.')}

- Prazo atual: ${formatDate(pipeline?.nextActionDueAt)}
- Owner: definir responsável comercial.
- Resultado esperado: confirmar funding gap, ativo financiável, estrutura aderente e janela de execução.

## 8. Memória relacionada
${noteLines}

## 9. Perguntas para reunião
1. Qual necessidade de capital está crescendo e por quê?
2. Como a empresa financia hoje carteira, recebíveis, clientes, fornecedores ou expansão?
3. Qual é o volume, prazo, concentração e performance dos ativos potencialmente financiáveis?
4. Há dívida estruturada, FIDC, cessão, trava bancária ou covenant já existente?
5. Qual uso de recursos, ticket e cronograma fariam sentido?
6. Quem patrocina internamente a operação e qual processo de decisão?

## 10. Decisão pós-conversa
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
  const [draft, setDraft] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNode, setSavedNode] = useState<KnowledgeNodeDetail | null>(null);

  const load = useCallback(async () => {
    const loaded = await knowledgeVaultApi.getCompanyWorkspace(session, companyId);
    setWorkspace(loaded);
    setDraft(buildDecisionBrief(loaded));
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
    return workspace.signals.length + workspace.monitoringOutputs.length + workspace.nodes.reduce((sum, node) => sum + (node.referenceCount ?? 0), 0);
  }, [workspace]);

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
          scoreMutation: false,
        },
        companyId,
        visibility: 'team',
      });
      setSavedNode(saved);
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
          <Pill tone="warning">{evidenceCount} referências potenciais</Pill>
          <Pill tone="default">não altera score</Pill>
        </div>
        <button type="button" className="secondary compact-button" disabled={loading} onClick={() => void load()}>
          Regerar do estado atual
        </button>
      </div>

      {loading ? <p className="table-helper">Consolidando Company Master, Qualification, Signals, Monitoring, Pipeline e memória...</p> : null}
      {error ? <div className="data-banner data-banner-warning"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {savedNode ? (
        <div className="data-banner data-banner-success">
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
              Revisei fatos, inferências, lacunas e fontes antes de salvar.
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
