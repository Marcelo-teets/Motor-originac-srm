import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageIntro, Pill, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { knowledgeSearchApi } from '../lib/knowledgeSearchApi';
import type { KnowledgeSearchResponse, KnowledgeSearchResult } from '../lib/knowledgeSearchTypes';
import type { CompanyListItem } from '../lib/types';
import '../styles/knowledge-search.css';

const suggestedQueries = [
  'funding gap e descasamento de capital',
  'recebíveis estruturáveis para FIDC',
  'expansão sem funding compatível',
  'pressão de embedded finance',
];

const sourceLabels: Record<string, string> = {
  company_signals: 'Sinal da empresa',
  monitoring_outputs: 'Monitoramento',
  qualification_snapshots: 'Qualificação',
  lead_score_snapshots: 'Lead score',
  companies: 'Company Master',
  knowledge_nodes: 'Knowledge Vault',
};

const sourceLabel = (value: string) => sourceLabels[value]
  ?? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('pt-BR'));

const formatScore = (value: number | null, digits = 0) => {
  if (value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
};

const formatPercent = (value: number | null) => value === null
  ? '—'
  : `${Math.round(value * 100).toLocaleString('pt-BR')}%`;

const buildEvidenceBlock = (result: KnowledgeSearchResult) => [
  `## Evidência recuperada${result.companyName ? ` — ${result.companyName}` : ''}`,
  '',
  result.content.trim(),
  '',
  `- Fonte: ${sourceLabel(result.sourceTable)}`,
  `- Registro: ${result.sourceId ?? result.id}`,
  `- Natureza: ${result.observedVsInferred ?? 'não classificada'}`,
  `- Vector document: ${result.lineage.vectorDocumentId}`,
].join('\n');

export function KnowledgeSearchPage() {
  const { session } = useAuth();
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [query, setQuery] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [data, setData] = useState<KnowledgeSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.getCompanies(session)
      .then((state) => { if (active) setCompanies(state.data); })
      .catch(() => { if (active) setCompanies([]); });
    return () => { active = false; };
  }, [session?.access_token]);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === companyId) ?? null,
    [companies, companyId],
  );

  const runSearch = async (searchQuery = query) => {
    const normalized = searchQuery.trim();
    if (normalized.length < 2) {
      setError('Descreva o fato, padrão, empresa ou estrutura que deseja recuperar.');
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await knowledgeSearchApi.search(session, {
        query: normalized,
        companyId: companyId || null,
        limit: 12,
      });
      setQuery(normalized);
      setData(response);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Falha ao pesquisar o corpus institucional.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch();
  };

  const copyEvidence = async (result: KnowledgeSearchResult) => {
    try {
      await navigator.clipboard.writeText(buildEvidenceBlock(result));
      setNotice('Evidência copiada em Markdown com lineage. Cole em uma nota, tese ou briefing do Vault.');
    } catch {
      setError('O navegador não permitiu copiar a evidência automaticamente.');
    }
  };

  return (
    <div className="page knowledge-search-page">
      <PageIntro
        eyebrow="Knowledge Vault / Retrieval V9"
        title="Busca institucional híbrida"
        description="Recupere sinais, monitoramentos e evidências por palavra e significado. O resultado preserva empresa, fonte, natureza observada ou inferida e o registro de origem."
        actions={(
          <div className="page-intro-actions">
            <Pill tone="success">Supabase real + RLS</Pill>
            <Pill tone="info">RRF explicável</Pill>
            <Link to="/knowledge-vault" className="button secondary">Abrir Vault</Link>
          </div>
        )}
      />

      <section className="knowledge-search-shell">
        <form className="knowledge-search-form" onSubmit={submit}>
          <label className="knowledge-search-query">
            <span>O que precisa encontrar?</span>
            <textarea
              rows={3}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex.: empresas com crescimento acelerado, recebíveis fortes e funding incompatível"
              maxLength={500}
            />
          </label>
          <label>
            <span>Escopo da empresa</span>
            <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              <option value="">Corpus institucional completo</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <div className="knowledge-search-submit">
            <small>{selectedCompany ? `Busca restrita a ${selectedCompany.name}` : 'Busca global com filtro posterior por lineage.'}</small>
            <button type="submit" disabled={loading}>{loading ? 'Pesquisando...' : 'Pesquisar evidências'}</button>
          </div>
        </form>

        <div className="knowledge-search-suggestions" aria-label="Buscas sugeridas">
          {suggestedQueries.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void runSearch(suggestion)} disabled={loading}>
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      {notice ? <div className="data-banner data-banner-success"><Pill tone="success">copiado</Pill><span>{notice}</span></div> : null}
      {error ? <div className="data-banner data-banner-warning"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}

      {data ? (
        <>
          <section className="mini-metric-grid knowledge-search-metrics">
            <Stat label="Resultados" value={String(data.results.length)} helper={`limite solicitado: ${data.matchCount}`} />
            <Stat label="Documentos no escopo" value={data.corpus.documents.toLocaleString('pt-BR')} helper={selectedCompany?.name ?? 'corpus completo'} />
            <Stat label="Com embedding real" value={data.corpus.embeddedDocuments.toLocaleString('pt-BR')} helper="vetores persistidos no Supabase" />
            <Stat label="Modo" value={data.mode === 'hybrid' ? 'Híbrido' : 'Lexical'} helper={data.semantic.model ?? 'fallback sem vetor sintético'} />
          </section>

          <section className="knowledge-search-status">
            <div className="pill-row">
              <Pill tone={data.semantic.available ? 'success' : 'warning'}>
                {data.semantic.available ? `semântico ${data.semantic.dimensions}d` : 'fallback lexical'}
              </Pill>
              <Pill tone="default">embedding sintético: não</Pill>
              <Pill tone="info">RLS autenticada</Pill>
            </div>
            <p>{data.caveat}</p>
            {!data.semantic.available && data.semantic.fallbackReason ? (
              <small>Motivo do fallback: {data.semantic.fallbackReason}. A busca continuou somente com o índice textual oficial.</small>
            ) : null}
          </section>

          <section className="knowledge-search-results">
            <div className="knowledge-search-results-head">
              <div>
                <span className="section-label">Evidências recuperadas</span>
                <h3>“{data.query}”</h3>
              </div>
              <span>{data.results.length} itens ordenados por Reciprocal Rank Fusion</span>
            </div>

            {data.results.length ? data.results.map((result, index) => (
              <article key={result.id} className="knowledge-search-result">
                <div className="knowledge-search-result-rank">{index + 1}</div>
                <div className="knowledge-search-result-main">
                  <div className="pill-row">
                    <Pill tone="info">{sourceLabel(result.sourceTable)}</Pill>
                    {result.companyName ? <Pill tone="default">{result.companyName}</Pill> : null}
                    {result.signalType ? <Pill tone="warning">{result.signalType}</Pill> : null}
                    {result.observedVsInferred ? (
                      <Pill tone={result.observedVsInferred === 'observed' ? 'success' : 'warning'}>{result.observedVsInferred}</Pill>
                    ) : null}
                  </div>
                  <pre>{result.content}</pre>
                  <div className="knowledge-search-lineage">
                    <span>RRF <b>{formatScore(result.rrfScore, 5)}</b></span>
                    <span>Lexical <b>#{result.lexicalRank ?? '—'}</b></span>
                    <span>Semântico <b>#{result.semanticRank ?? '—'} · {formatPercent(result.semanticSimilarity)}</b></span>
                    <span>Confiança <b>{formatScore(result.confidenceScore, 2)}</b></span>
                    <span>Origem <b>{result.sourceId ?? result.id}</b></span>
                  </div>
                </div>
                <div className="knowledge-search-result-actions">
                  <button type="button" className="secondary compact-button" onClick={() => void copyEvidence(result)}>Copiar contexto</button>
                  {result.companyId ? <Link to={`/companies/${result.companyId}`} className="button secondary compact-button">Abrir empresa</Link> : null}
                </div>
              </article>
            )) : (
              <EmptyState title="Nenhuma evidência encontrada" description="Tente uma formulação mais ampla, remova o filtro de empresa ou use termos ligados ao fato financeiro observado." />
            )}
          </section>
        </>
      ) : (
        <EmptyState
          title="Pesquise o mapa de evidências do motor"
          description="A busca combina o índice textual em português com os embeddings reais já persistidos. Quando o provedor semântico não responde, o sistema sinaliza o fallback e não fabrica vetores."
        />
      )}
    </div>
  );
}
