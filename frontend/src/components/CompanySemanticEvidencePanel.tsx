import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Pill, Stat } from './UI';
import { useAuth } from '../lib/auth';
import { knowledgeSearchApi } from '../lib/knowledgeSearchApi';
import { knowledgeVaultApi } from '../lib/knowledgeVaultApi';
import type {
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from '../lib/knowledgeSearchTypes';
import type { KnowledgeQualificationSnapshot } from '../lib/knowledgeVaultTypes';

const vaultHref = '/knowledge-vault';

const lenses = [
  {
    id: 'funding-gap',
    label: 'Funding gap',
    description: 'Pressão de caixa, necessidade de capital, crescimento financiado e inadequação do funding atual.',
    query: 'necessidade de funding, pressão de capital de giro, funding gap, caixa, dívida e crescimento sem capital compatível',
  },
  {
    id: 'receivables-fidc',
    label: 'Recebíveis / FIDC',
    description: 'Carteira, contratos, recorrência, concentração, performance e indícios de lastro estruturável.',
    query: 'recebíveis estruturáveis, carteira elegível, contratos recorrentes, concentração, inadimplência, cessão e potencial de FIDC',
  },
  {
    id: 'capital-structure',
    label: 'Estrutura de capital',
    description: 'Descasamento de prazo, dívida corporativa, expansão e alternativas aderentes de DCM.',
    query: 'estrutura de capital, descasamento de prazo, dívida estruturada, expansão, capex, reperfilamento e potencial de DCM',
  },
  {
    id: 'why-now',
    label: 'Por que agora?',
    description: 'Eventos recentes que podem abrir a janela comercial ou elevar urgência e timing.',
    query: 'sinais recentes, expansão, contratação, produto de crédito, emissão, vencimento, mudança financeira e timing de abordagem',
  },
] as const;

type EvidenceLens = typeof lenses[number];

type CompanySemanticEvidencePanelProps = {
  companyId: string;
  companyName: string;
  qualification: KnowledgeQualificationSnapshot | null;
  pipelineNextAction?: string | null;
  onNoteCreated?: () => Promise<void> | void;
};

const sourceLabel = (value: string) => value
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('pt-BR'));

const percentage = (value: number | null) => value === null
  ? '—'
  : `${Math.round(value * 100).toLocaleString('pt-BR')}%`;

const buildQuery = (
  lens: EvidenceLens,
  companyName: string,
  qualification: KnowledgeQualificationSnapshot | null,
) => {
  const context = [
    lens.query,
    qualification?.suggestedStructure ? `estrutura sugerida ${qualification.suggestedStructure}` : null,
    qualification?.fundingGapLevel ? `funding gap ${qualification.fundingGapLevel}` : null,
    qualification?.fitFidc ? 'fit para FIDC' : null,
    qualification?.fitDcm ? 'fit para DCM' : null,
  ].filter(Boolean);

  return `${companyName}: ${context.join('; ')}`;
};

const evidenceMarkdown = (result: KnowledgeSearchResult, index: number) => [
  `### ${index + 1}. ${result.signalType || sourceLabel(result.sourceTable)}`,
  '',
  result.content.trim(),
  '',
  `- Empresa: ${result.companyName || 'não identificada'}`,
  `- Fonte: ${sourceLabel(result.sourceTable)}`,
  `- Registro de origem: ${result.sourceId || result.id}`,
  `- Natureza: ${result.observedVsInferred || 'não classificada'}`,
  `- Confiança: ${result.confidenceScore ?? 'não informada'}`,
  `- RRF: ${result.rrfScore}`,
  `- Similaridade semântica: ${result.semanticSimilarity ?? 'não disponível'}`,
  `- Vector document: ${result.lineage.vectorDocumentId}`,
].join('\n');

export function CompanySemanticEvidencePanel({
  companyId,
  companyName,
  qualification,
  pipelineNextAction,
  onNoteCreated,
}: CompanySemanticEvidencePanelProps) {
  const { session } = useAuth();
  const [selectedLensId, setSelectedLensId] = useState<EvidenceLens['id']>('funding-gap');
  const [data, setData] = useState<KnowledgeSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedLens = useMemo(
    () => lenses.find((lens) => lens.id === selectedLensId) ?? lenses[0],
    [selectedLensId],
  );

  const searchEvidence = async (lens: EvidenceLens = selectedLens) => {
    setSelectedLensId(lens.id);
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await knowledgeSearchApi.search(session, {
        query: buildQuery(lens, companyName, qualification),
        companyId,
        limit: 8,
      });
      setData(response);
    } catch (searchError) {
      setData(null);
      setError(searchError instanceof Error ? searchError.message : 'Falha ao recuperar evidências da empresa.');
    } finally {
      setLoading(false);
    }
  };

  const saveAsThesis = async () => {
    if (!data?.results.length) return;

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const evidence = data.results.slice(0, 6);
      const content = [
        `# Mapa de evidências — ${companyName}`,
        '',
        `## Lente de decisão`,
        '',
        `**${selectedLens.label}:** ${selectedLens.description}`,
        '',
        `## Consulta executada`,
        '',
        data.query,
        '',
        `## Contexto atual`,
        '',
        `- Qualification: ${qualification?.totalScore ?? 'não disponível'}`,
        `- Funding need: ${qualification?.fundingNeedScore ?? 'não disponível'}`,
        `- Urgência: ${qualification?.urgencyScore ?? 'não disponível'}`,
        `- Estrutura sugerida: ${qualification?.suggestedStructure ?? 'em avaliação'}`,
        `- Funding gap: ${qualification?.fundingGapLevel ?? 'em avaliação'}`,
        `- Próxima ação: ${qualification?.nextAction || pipelineNextAction || 'validar evidências e definir abordagem'}`,
        '',
        `## Evidências recuperadas`,
        '',
        ...evidence.flatMap((result, index) => [evidenceMarkdown(result, index), '']),
        `## Leitura e próximos passos`,
        '',
        '- Confirmar cada evidência na fonte primária antes de usar em abordagem, qualificação ou comitê.',
        '- Separar fato observado de inferência analítica.',
        '- Registrar conclusão comercial e próxima ação no pipeline após validação humana.',
        '',
        `> Recuperação ${data.mode} por Reciprocal Rank Fusion. Relevância de busca não é score de crédito e não altera qualification, patterns, ranking ou pipeline.`,
      ].join('\n');

      await knowledgeVaultApi.saveNode(session, {
        title: `Mapa de evidências — ${companyName} — ${selectedLens.label}`,
        nodeType: 'thesis',
        contentMarkdown: content,
        tags: ['decision-context', 'semantic-evidence', selectedLens.id],
        properties: {
          generatedFrom: 'knowledge_hybrid_search',
          query: data.query,
          searchMode: data.mode,
          semanticAvailable: data.semantic.available,
          semanticModel: data.semantic.model,
          semanticDimensions: data.semantic.dimensions,
          syntheticEmbedding: false,
          evidenceCount: evidence.length,
          generatedAt: data.generatedAt,
          lens: selectedLens.id,
        },
        companyId,
        visibility: 'team',
      });

      setNotice('Mapa de evidências salvo como tese auditável no Knowledge Vault.');
      await onNoteCreated?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar o mapa de evidências no Vault.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="company-knowledge-section company-semantic-evidence" data-feature-build="knowledge-company-evidence-v11">
      <div className="company-knowledge-section-head">
        <div>
          <span className="section-label">Contexto de decisão</span>
          <h4>Evidências semânticas da empresa</h4>
          <p>Recupere fatos do corpus institucional por uma lente financeira. A busca só roda quando solicitada e não altera os motores.</p>
        </div>
        <div className="pill-row">
          <Pill tone="info">company scoped</Pill>
          <Pill tone="default">human in the loop</Pill>
        </div>
      </div>

      <div className="company-evidence-lenses" role="group" aria-label="Lentes de evidência">
        {lenses.map((lens) => (
          <button
            key={lens.id}
            type="button"
            className={selectedLens.id === lens.id ? 'active' : ''}
            disabled={loading}
            onClick={() => void searchEvidence(lens)}
          >
            <strong>{lens.label}</strong>
            <span>{lens.description}</span>
          </button>
        ))}
      </div>

      {error ? <div className="data-banner data-banner-warning" role="alert"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {notice ? <div className="data-banner data-banner-success" role="status"><Pill tone="success">salvo</Pill><span>{notice}</span><Link to={vaultHref}>Abrir Vault</Link></div> : null}
      {loading ? <p className="table-helper">Recuperando evidências reais de {companyName}...</p> : null}

      {!loading && data ? (
        <>
          <div className="mini-metric-grid company-evidence-metrics">
            <Stat label="Resultados" value={String(data.results.length)} helper={selectedLens.label} />
            <Stat label="Modo" value={data.mode === 'hybrid' ? 'Híbrido' : 'Lexical'} helper={data.semantic.model ?? data.semantic.fallbackReason ?? 'índice textual'} />
            <Stat label="Corpus da empresa" value={data.corpus.documents.toLocaleString('pt-BR')} helper={`${data.corpus.embeddedDocuments.toLocaleString('pt-BR')} com vetor real`} />
            <Stat label="Embedding sintético" value="Não" helper="guardrail obrigatório" />
          </div>

          <div className="company-evidence-toolbar">
            <p>{data.caveat}</p>
            <div className="actions">
              <button type="button" className="secondary compact-button" onClick={() => void searchEvidence()} disabled={loading}>Atualizar</button>
              <button type="button" className="compact-button" onClick={() => void saveAsThesis()} disabled={saving || data.results.length === 0}>
                {saving ? 'Salvando...' : 'Salvar mapa como tese'}
              </button>
            </div>
          </div>

          {data.results.length ? (
            <div className="company-evidence-results">
              {data.results.slice(0, 6).map((result, index) => (
                <article key={result.id} className="company-evidence-result">
                  <div className="company-evidence-rank">{index + 1}</div>
                  <div>
                    <div className="pill-row">
                      <Pill tone="info">{sourceLabel(result.sourceTable)}</Pill>
                      {result.signalType ? <Pill tone="warning">{result.signalType}</Pill> : null}
                      {result.observedVsInferred ? <Pill tone={result.observedVsInferred === 'observed' ? 'success' : 'warning'}>{result.observedVsInferred}</Pill> : null}
                    </div>
                    <p>{result.content}</p>
                    <small>
                      RRF {result.rrfScore.toFixed(5)} · semântico {percentage(result.semanticSimilarity)} · origem {result.sourceId || result.id}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Nenhuma evidência encontrada nesta lente." description="Tente outra lente ou valide se a empresa já possui sinais e outputs indexados no corpus institucional." />
          )}
        </>
      ) : null}

      {!loading && !data ? (
        <EmptyState
          title="Escolha uma lente para mapear as evidências."
          description="A consulta será restrita à empresa e poderá ser salva como tese somente após sua revisão."
        />
      ) : null}
    </section>
  );
}
