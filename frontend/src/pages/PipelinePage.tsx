import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataStatusBanner, EmptyState, ErrorState, LoadingState, PageIntro, Pill } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AbmWeeklyWarRoom, DataState, PipelineRow, PipelineSnapshot, PipelineStage } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

const ACTIVE_STAGES: PipelineStage[] = ['Identified', 'Qualified', 'Approach', 'Structuring', 'Mandated'];
const CLOSED_STAGES: PipelineStage[] = ['ClosedWon', 'ClosedLost', 'Recycled'];
const PIPELINE_STAGES: PipelineStage[] = [...ACTIVE_STAGES, ...CLOSED_STAGES];

type PipelineWorkspaceRow = PipelineRow & {
  company?: {
    id: string;
    name: string;
    segment: string;
    suggestedStructure: string;
    leadScore: number;
  };
};

type Feedback = { tone: 'success' | 'error'; message: string } | null;

const stageLabels: Record<PipelineStage, string> = {
  Identified: 'Identificados',
  Qualified: 'Qualificados',
  Approach: 'Abordagem',
  Structuring: 'Estruturação',
  Mandated: 'Mandatados',
  ClosedWon: 'Fechados',
  ClosedLost: 'Perdidos',
  Recycled: 'Reciclagem',
};

const emptyAbm = (): AbmWeeklyWarRoom => ({
  top_accounts: [],
  cooling_accounts: [],
  without_champion: [],
  overdue_next_steps: [],
  critical_open_objections: [],
});

const emptyPipeline = (): DataState<PipelineSnapshot> => ({
  source: 'partial',
  note: 'Pipeline indisponível; exibindo fallback operacional.',
  data: { stages: [], recentActivities: [] },
});

function stageTone(stage: PipelineStage): 'success' | 'danger' | 'warning' | 'info' {
  if (stage === 'ClosedWon') return 'success';
  if (stage === 'ClosedLost') return 'danger';
  if (stage === 'Mandated' || stage === 'Structuring') return 'warning';
  return 'info';
}

export function PipelinePage() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'board' | 'attention'>('board');
  const [showClosed, setShowClosed] = useState(false);
  const [movingCompanyId, setMovingCompanyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const { data, loading, error, setData, reload } = useAsyncData(async () => {
    const [snapshotResult, rowsResult, companiesResult, abmResult] = await Promise.allSettled([
      api.getPipelineSnapshot(session),
      api.listPipeline(session),
      api.getCompanies(session),
      api.getAbmWeekly(session),
    ]);

    const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : emptyPipeline();
    const rows = rowsResult.status === 'fulfilled' ? rowsResult.value : [];
    const companies = companiesResult.status === 'fulfilled' ? companiesResult.value.data : [];
    const abm = abmResult.status === 'fulfilled' ? abmResult.value.data : emptyAbm();
    const companyMap = new Map(companies.map((company) => [company.id, company]));

    return {
      ...snapshot,
      rows: rows.map((row) => ({ ...row, company: companyMap.get(row.companyId) })) as PipelineWorkspaceRow[],
      abm,
      health: {
        rowsOk: rowsResult.status === 'fulfilled',
        abmOk: abmResult.status === 'fulfilled',
      },
    };
  }, [session?.access_token]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data.rows;
    return data.rows.filter((row) => [row.company?.name, row.company?.segment, row.company?.suggestedStructure, row.nextAction, row.owner]
      .join(' ').toLowerCase().includes(normalized));
  }, [data, query]);

  const board = useMemo(() => new Map(PIPELINE_STAGES.map((stage) => [stage, filteredRows.filter((row) => row.stage === stage)])), [filteredRows]);

  if (loading) return <LoadingState title="Pipeline" subtitle="Organizando oportunidades e próximos passos." />;
  if (error || !data) return <ErrorState title="Pipeline" error={error} action={<button type="button" onClick={reload}>Tentar novamente</button>} />;

  const activeDeals = filteredRows.filter((row) => ACTIVE_STAGES.includes(row.stage)).length;
  const advancedDeals = filteredRows.filter((row) => ['Structuring', 'Mandated'].includes(row.stage)).length;
  const attentionCount = data.abm.cooling_accounts.length + data.abm.without_champion.length + data.abm.overdue_next_steps.length + data.abm.critical_open_objections.length;
  const visibleStages = showClosed ? PIPELINE_STAGES : ACTIVE_STAGES;

  const moveCompany = async (row: PipelineWorkspaceRow, targetStage: PipelineStage) => {
    if (row.stage === targetStage || movingCompanyId) return;
    setMovingCompanyId(row.companyId);
    setFeedback(null);
    try {
      await api.movePipelineStage(session, row.companyId, targetStage);
      setData((current) => current ? {
        ...current,
        rows: current.rows.map((item) => item.companyId === row.companyId ? { ...item, stage: targetStage } : item),
      } : current);
      setFeedback({ tone: 'success', message: `${row.company?.name ?? 'Empresa'} movida para ${stageLabels[targetStage]}.` });
    } catch (moveError) {
      setFeedback({ tone: 'error', message: moveError instanceof Error ? moveError.message : 'Não foi possível mover a empresa.' });
    } finally {
      setMovingCompanyId(null);
    }
  };

  const attentionItems = [
    ...data.abm.overdue_next_steps.map((item) => ({ companyId: item.company_id, company: item.company_name, type: 'Próximo passo vencido', detail: item.next_step_due_at, tone: 'danger' as const })),
    ...data.abm.cooling_accounts.map((item) => ({ companyId: item.company_id, company: item.company_name, type: 'Conta esfriando', detail: 'Recuperar momentum comercial', tone: 'warning' as const })),
    ...data.abm.without_champion.map((item) => ({ companyId: item.company_id, company: item.company_name, type: 'Sem champion', detail: 'Mapear sponsor financeiro', tone: 'warning' as const })),
    ...data.abm.critical_open_objections.map((item) => ({ companyId: item.company_id, company: data.rows.find((row) => row.companyId === item.company_id)?.company?.name ?? 'Empresa', type: 'Objeção crítica', detail: item.objection_text, tone: 'danger' as const })),
  ];

  return (
    <div className="page simple-page simple-pipeline-page">
      <PageIntro
        eyebrow="Execução comercial"
        title="Oportunidades em andamento"
        description="Veja onde cada conta está, o que impede o avanço e qual é o próximo passo. Etapas encerradas ficam ocultas por padrão."
        actions={<Link to="/companies" className="button secondary">Adicionar a partir dos leads</Link>}
      />

      <DataStatusBanner source={data.source} note={data.note} />

      <section className="simple-metrics simple-pipeline-metrics" aria-label="Resumo do pipeline">
        <div><span>Deals ativos</span><strong>{activeDeals}</strong><small>da identificação ao mandato</small></div>
        <div><span>Em estruturação</span><strong>{advancedDeals}</strong><small>estruturação ou mandato</small></div>
        <button type="button" onClick={() => setView('attention')}><span>Precisam de atenção</span><strong>{attentionCount}</strong><small>bloqueios comerciais</small></button>
      </section>

      <section className="simple-pipeline-toolbar">
        <div className="segmented-control" aria-label="Visão do pipeline">
          <button type="button" aria-pressed={view === 'board'} className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>Quadro</button>
          <button type="button" aria-pressed={view === 'attention'} className={view === 'attention' ? 'active' : ''} onClick={() => setView('attention')}>Atenção <span>{attentionCount}</span></button>
        </div>
        <label>
          <span>Buscar</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Empresa, estrutura ou responsável" />
        </label>
        <button type="button" className="secondary" aria-pressed={showClosed} onClick={() => setShowClosed((current) => !current)}>
          {showClosed ? 'Ocultar encerrados' : 'Ver encerrados'}
        </button>
        <div className="pipeline-health-pills">
          <Pill tone={data.health.rowsOk ? 'success' : 'warning'}>{data.health.rowsOk ? 'CRM atualizado' : 'CRM parcial'}</Pill>
          <Pill tone={data.health.abmOk ? 'success' : 'warning'}>{data.health.abmOk ? 'Alertas atualizados' : 'Alertas parciais'}</Pill>
        </div>
      </section>

      {feedback ? <div className={`inline-notice inline-notice-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite"><span>{feedback.message}</span></div> : null}

      {view === 'board' ? (
        <section className="simple-pipeline-board" aria-label="Quadro do pipeline">
          {visibleStages.map((stage) => {
            const rows = board.get(stage) ?? [];
            return (
              <section key={stage} className={`simple-pipeline-column simple-pipeline-column-${stage.toLowerCase()}`} aria-labelledby={`pipeline-stage-${stage}`}>
                <header><div><span className="pipeline-stage-dot" aria-hidden="true" /><strong id={`pipeline-stage-${stage}`}>{stageLabels[stage]}</strong></div><Pill tone={stageTone(stage)}>{rows.length}</Pill></header>
                <div>
                  {rows.length ? rows.map((row) => (
                    <article key={row.id} className="simple-pipeline-card" aria-busy={movingCompanyId === row.companyId}>
                      <header><Link to={`/companies/${row.companyId}`}>{row.company?.name ?? row.companyId}</Link><strong>{row.company?.leadScore ?? '—'}</strong></header>
                      <span>{row.company?.suggestedStructure ?? 'Estrutura em definição'}</span>
                      <p>{row.nextAction || 'Definir próximo passo comercial'}</p>
                      <footer>
                        <small>{row.owner}</small>
                        <label><span>Mover para</span><select value={row.stage} disabled={movingCompanyId !== null} onChange={(event) => void moveCompany(row, event.target.value as PipelineStage)}>{PIPELINE_STAGES.map((option) => <option key={option} value={option}>{stageLabels[option]}</option>)}</select></label>
                      </footer>
                    </article>
                  )) : <div className="simple-column-empty">Nenhuma empresa</div>}
                </div>
              </section>
            );
          })}
        </section>
      ) : (
        <section className="simple-attention-list">
          {attentionItems.length ? attentionItems.map((item, index) => (
            <article key={`${item.companyId}-${item.type}-${index}`}>
              <Pill tone={item.tone}>{item.type}</Pill>
              <div><Link to={`/companies/${item.companyId}`}>{item.company}</Link><p>{item.detail}</p></div>
              <Link to={`/companies/${item.companyId}`} className="button secondary compact-button">Resolver</Link>
            </article>
          )) : <EmptyState title="Nenhum alerta crítico" description="As oportunidades estão com próximos passos e responsáveis sob controle." />}
        </section>
      )}
    </div>
  );
}
