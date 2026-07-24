import { useEffect, useMemo, useState } from 'react';
import { EmptyState, Pill, Stat } from './UI';
import { useAuth } from '../lib/auth';
import { knowledgeOutcomeApi } from '../lib/knowledgeOutcomeApi';
import type {
  KnowledgeOutcomeDimension,
  KnowledgeOutcomeDimensions,
  KnowledgeOutcomeIntelligence,
  OutcomeSampleQuality,
} from '../lib/knowledgeOutcomeTypes';
import '../styles/knowledge-outcome-intelligence.css';

type Props = {
  companyId?: string;
  companyName?: string;
  refreshToken?: number;
};

type DimensionKey = keyof KnowledgeOutcomeDimensions;

const dimensionTabs: Array<{ key: DimensionKey; label: string }> = [
  { key: 'actionTypes', label: 'Ações' },
  { key: 'structures', label: 'Estruturas' },
  { key: 'signalTypes', label: 'Sinais' },
  { key: 'patterns', label: 'Padrões' },
  { key: 'factors', label: 'Fatores' },
  { key: 'nodeTypes', label: 'Tipos de nota' },
];

const actionLabels: Record<string, string> = {
  follow_up: 'Follow-up',
  meeting: 'Reunião',
  email: 'E-mail',
  call: 'Ligação',
  research: 'Análise / pesquisa',
  committee: 'Comitê',
  other: 'Outra ação',
  thesis: 'Tese',
  signal: 'Sinal',
  source: 'Fonte',
  meeting_note: 'Reunião',
};

const formatLabel = (value: string) => actionLabels[value]
  ?? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toLocaleUpperCase('pt-BR'));

const formatPercent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;
const formatNumber = (value: number | null, digits = 1) => value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: digits });

const sampleLabel: Record<OutcomeSampleQuality, string> = {
  insufficient: 'amostra insuficiente',
  directional: 'leitura direcional',
  stronger: 'amostra mais robusta',
};

const sampleTone = (quality: OutcomeSampleQuality) => {
  if (quality === 'stronger') return 'success' as const;
  if (quality === 'directional') return 'info' as const;
  return 'warning' as const;
};

const dimensionTone = (row: KnowledgeOutcomeDimension) => {
  if (row.sampleQuality === 'insufficient') return 'warning' as const;
  if ((row.observedWinRate ?? 0) >= 0.6) return 'success' as const;
  return 'info' as const;
};

export function KnowledgeOutcomeIntelligencePanel({ companyId, companyName, refreshToken = 0 }: Props) {
  const { session } = useAuth();
  const [data, setData] = useState<KnowledgeOutcomeIntelligence | null>(null);
  const [activeDimension, setActiveDimension] = useState<DimensionKey>('actionTypes');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void knowledgeOutcomeApi.get(session, companyId, 365)
      .then((loaded) => active && setData(loaded))
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar Outcome Intelligence.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [companyId, refreshToken, session?.access_token]);

  const activeRows = useMemo(
    () => data?.dimensions[activeDimension] ?? [],
    [activeDimension, data?.dimensions],
  );

  const contextCoverage = data?.summary.executions
    ? data.summary.capturedContextCount / data.summary.executions
    : null;

  return (
    <section className="knowledge-outcome-panel">
      <div className="knowledge-outcome-head">
        <div>
          <span className="section-label">Outcome Intelligence V6</span>
          <h3>O que está convertendo em avanço real?</h3>
          <p>
            Associação observada entre notas, sinais, padrões, fatores, ações e resultados do pipeline.
            A leitura {companyId ? `está filtrada para ${companyName ?? 'a empresa selecionada'}` : 'cobre a operação inteira'}.
          </p>
        </div>
        <div className="pill-row">
          <Pill tone="info">janela 365 dias</Pill>
          <Pill tone={companyId ? 'warning' : 'default'}>{companyId ? 'escopo empresa' : 'escopo global'}</Pill>
        </div>
      </div>

      {loading ? <p className="knowledge-outcome-muted">Carregando resultados, contexto e mapa de fatores...</p> : null}
      {error ? <div className="data-banner data-banner-warning"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}

      {!loading && data ? (
        <>
          <div className="mini-metric-grid knowledge-outcome-metrics">
            <Stat label="Ações rastreadas" value={String(data.summary.executions)} helper={`${data.summary.completedOutcomes} com resultado`} />
            <Stat label="Decisões terminais" value={String(data.summary.terminalDecisions)} helper={`${data.summary.won} ganhas · ${data.summary.lost} perdidas`} />
            <Stat label="Win rate observado" value={formatPercent(data.summary.observedWinRate)} helper="apenas won ÷ won+lost" />
            <Stat label="Avanço de estágio" value={formatPercent(data.summary.observedStageAdvanceRate)} helper="ações com mudança positiva" />
            <Stat label="Ciclo médio" value={data.summary.averageCycleDays === null ? '—' : `${formatNumber(data.summary.averageCycleDays)}d`} helper="ação até resultado" />
            <Stat label="Contexto capturado" value={formatPercent(contextCoverage)} helper={`${data.summary.capturedContextCount} snapshots imutáveis`} />
          </div>

          <div className="knowledge-outcome-caveat">
            <Pill tone="warning">não causal</Pill>
            <span>{data.caveat}</span>
          </div>

          <div className="knowledge-outcome-layout">
            <section className="knowledge-outcome-section">
              <div className="knowledge-outcome-section-head">
                <div>
                  <span className="section-label">Ações do Vault</span>
                  <h4>Conversão observada por dimensão</h4>
                </div>
                <Pill tone={data.summary.terminalDecisions >= 5 ? 'info' : 'warning'}>
                  {data.summary.terminalDecisions >= 5 ? 'leitura direcional' : 'coletando amostra'}
                </Pill>
              </div>

              <div className="knowledge-outcome-tabs" role="tablist" aria-label="Dimensões de Outcome Intelligence">
                {dimensionTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={activeDimension === tab.key ? 'active' : ''}
                    onClick={() => setActiveDimension(tab.key)}
                  >
                    {tab.label}
                    <span>{data.dimensions[tab.key].length}</span>
                  </button>
                ))}
              </div>

              {activeRows.length ? (
                <div className="knowledge-outcome-rows">
                  {activeRows.map((row) => (
                    <article key={`${row.dimensionType}:${row.dimensionValue}`} className="knowledge-outcome-row">
                      <div className="knowledge-outcome-row-main">
                        <strong>{formatLabel(row.dimensionValue)}</strong>
                        <small>{row.executions} ações · {row.companiesObserved} empresas · {row.completedOutcomes} resultados</small>
                      </div>
                      <div className="knowledge-outcome-row-results">
                        <span><b>{row.won}</b> won</span>
                        <span><b>{row.lost}</b> lost</span>
                        <span><b>{row.progress}</b> avanço</span>
                        <span><b>{row.open}</b> abertas</span>
                      </div>
                      <div className="knowledge-outcome-row-rate">
                        <strong>{formatPercent(row.observedWinRate)}</strong>
                        <small>win rate observado</small>
                      </div>
                      <Pill tone={dimensionTone(row)}>{sampleLabel[row.sampleQuality]}</Pill>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Ainda não há resultados nesta dimensão."
                  description="As próximas ações concluídas no Company Detail começarão a formar esta amostra, sem alterar scores automaticamente."
                />
              )}
            </section>

            <section className="knowledge-outcome-section factor-map-section">
              <div className="knowledge-outcome-section-head">
                <div>
                  <span className="section-label">Factor Outcome Map V2</span>
                  <h4>Fatores observados × estágio real</h4>
                </div>
                <Pill tone="default">Structuring = ativo</Pill>
              </div>

              {data.factorPipelineMap.length ? (
                <div className="factor-outcome-rows">
                  {data.factorPipelineMap.map((factor) => (
                    <article key={factor.factorCode} className="factor-outcome-row">
                      <div>
                        <strong>{factor.factorName}</strong>
                        <small>{formatLabel(factor.dimension)} · contribuição média {formatNumber(factor.averageNetContribution, 2)}</small>
                      </div>
                      <div className="factor-outcome-counts">
                        <span><b>{factor.activePipeline}</b> ativos</span>
                        <span><b>{factor.positiveOutcomes}</b> positivos</span>
                        <span><b>{factor.negativeOutcomes}</b> negativos</span>
                      </div>
                      <Pill tone={sampleTone(factor.sampleQuality)}>{sampleLabel[factor.sampleQuality]}</Pill>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState title="Sem fatores qualificados nesta visão." description="Recalcule qualification e factors para alimentar o mapa conservador de pipeline." />
              )}
            </section>
          </div>

          {!data.summary.executions ? (
            <div className="knowledge-outcome-empty-banner">
              <Pill tone="info">instrumentação ativa</Pill>
              <div>
                <strong>A coleta de resultados começou agora.</strong>
                <span>O mapa de fatores já usa os leads atuais; as taxas de ação permanecerão vazias até o time registrar outcomes reais.</span>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
