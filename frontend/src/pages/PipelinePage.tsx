import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataStatusBanner, EmptyState, LoadingState, PageIntro, Pill } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AbmWeeklyWarRoom, DataState, PipelineRow, PipelineSnapshot, PipelineStage } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

const PIPELINE_STAGES: PipelineStage[] = ['Identified', 'Qualified', 'Approach', 'Structuring', 'Mandated', 'ClosedWon', 'ClosedLost', 'Recycled'];

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
  note: 'Pipeline indisponível; exibindo fallback operacional para não bloquear a rotina de cobertura.',
  data: { stages: [], recentActivities: [] },
});

function stageTone(stage: PipelineStage) {
  if (stage === 'ClosedWon') return 'success';
  if (stage === 'ClosedLost') return 'danger';
  if (stage === 'Mandated' || stage === 'Structuring') return 'warning';
  return 'info';
}

export function PipelinePage() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'board' | 'attention'>('board');
  const [movingCompanyId, setMovingCompanyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const { data, loading, setData } = useAsyncData(async () => {
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
      rows: rows.map((row) => ({
        ...row,
        company: companyMap.get(row.companyId),
      })),
      abm,
      health: {
        snapshotOk: snapshotResult.status === 'fulfilled',
        rowsOk: rowsResult.status === 'fulfilled',
        companiesOk: companiesResult.status === 'fulfilled',
        abmOk: abmResult.status === 'fulfilled',
      },
    };
  }, [session?.access_token]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data.rows;
    return data.rows.filter((row) => [
      row.company?.name,
      row.company?.segment,
      row.company?.suggestedStructure,
      row.nextAction,
      row.owner,
    ].join(' ').toLowerCase().includes(normalized));
  }, [data, query]);

  const board = useMemo(() => new Map(PIPELINE_STAGES.map((stage) => [
    stage,
    filteredRows.filter((row) => row.stage === stage),
  ])), [filteredRows]);

  if (loading) return <LoadingState title="Pipeline" subtitle="Montando o quadro comercial, alertas e próximas ações." />;
  if (!data) return <LoadingState title="Pipeline" subtitle="Preparando o workspace operacional." />;

  const openStages = PIPELINE_STAGES.filter((stage) => !['ClosedWon', 'ClosedLost', 'Recycled'].includes(stage));
  const activeDeals = filteredRows.filter((row) => openStages.includes(row.stage)).length;
  const advancedDeals = filteredRows.filter((row) => ['Structuring', 'Mandated'].includes(row.stage)).length;
  const missingNextAction = filteredRows.filter((row) => !row.nextAction?.trim() || row.nextAction === 'Definir próximo passo').length;
  const attentionCount = data.abm.cooling_accounts.length + data.abm.without_champion.length + data.abm.overdue_next_steps.length + data.abm.critical_open_objections.length;

  const moveCompany = async (row: PipelineRow, targetStage: PipelineStage) => {
    if (row.stage === targetStage) return;
    setMovingCompanyId(row.companyId);
    setFeedback('');
    try {
      await api.movePipelineStage(session, row.companyId, targetStage);
      setData((current) => current ? {
        ...current,
        rows: current.rows.map((item) => item.companyId === row.companyId ? { ...item, stage: targetStage } : item),
      } : current);
      setFeedback(`${row.company?.name ?? 'Empresa'} movida para ${stageLabels[targetStage]}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Não foi possível mover a empresa.');
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
    <div className="page pipeline-workspace-page">
      <PageIntro
        eyebrow="Execução comercial"
        title="Pipeline de originação"
        description="Um quadro de trabalho para avançar contas, enxergar gargalos e garantir que cada oportunidade tenha uma próxima ação clara."
        actions={(
          <div className="pill-row">
            <Link to="/companies" className="button secondary">Adicionar a partir dos leads</Link>
            <Link to="/dcm-daily" className="button">Preparar abordagens</Link>
          </div>
        )}
      />

      <DataStatusBanner source={data.source} note={data.note} />

      <section className="pipeline-metric-strip" aria-label="Resumo do pipeline">
        <div><span>Deals ativos</span><strong>{activeDeals}</strong><small>entre identificação e mandato</small></div>
        <div><span>Em estruturação</span><strong>{advancedDeals}</strong><small>estruturação ou mandato</small></div>
        <div><span>Precisam de atenção</span><strong>{attentionCount}</strong><small>alertas comerciais abertos</small></div>
        <div><span>Sem próxima ação</span><strong>{missingNextAction}</strong><small>risco de estagnação</small></div>
      </section>

      <section className="pipeline-toolbar">
        <div className="segmented-control" aria-label="Visão do pipeline">
          <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>Quadro</button>
          <button type="button" className={view === 'attention' ? 'active' : ''} onClick={() => setView('attention')}>Fila de atenção <span>{attentionCount}</span></button>
        </div>
        <label>
          <span>Buscar no pipeline</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Empresa, estrutura, responsável ou ação" />
        </label>
        <div className="pipeline-health-pills">
          <Pill tone={data.health.rowsOk ? 'success' : 'warning'}>{data.health.rowsOk ? 'CRM real' : 'CRM parcial'}</Pill>
          <Pill tone={data.health.abmOk ? 'success' : 'warning'}>{data.health.abmOk ? 'ABM real' : 'ABM parcial'}</Pill>
        </div>
      </section>

      {feedback ? <div className="inline-notice"><span>{feedback}</span></div> : null}

      {view === 'board' ? (
        <section className="pipeline-board" aria-label="Kanban do pipeline">
          {PIPELINE_STAGES.map((stage) => {
            const rows = board.get(stage) ?? [];
            return (
              <section key={stage} className={`pipeline-column pipeline-column-${stage.toLowerCase()}`}>
                <header>
                  <div>
                    <span className="pipeline-stage-dot" aria-hidden="true" />
                    <strong>{stageLabels[stage]}</strong>
                  </div>
                  <Pill tone={stageTone(stage)}>{rows.length}</Pill>
                </header>

                <div className="pipeline-column-body">
                  {rows.length ? rows.map((row) => (
                    <article key={row.id} className="pipeline-deal-card">
                      <div className="pipeline-deal-heading">
                        <Link to={`/companies/${row.companyId}`}>{row.company?.name ?? row.companyId}</Link>
                        <small>{row.owner}</small>
                      </div>
                      <div className="pipeline-deal-meta">
                        <span>{row.company?.suggestedStructure ?? 'Estrutura em definição'}</span>
                        {row.company?.leadScore !== undefined ? <strong>{row.company.leadScore}</strong> : null}
                      </div>
                      <p>{row.nextAction || 'Definir próximo passo comercial'}</p>
                      <label>
                        <span>Mover para</span>
                        <select
                          value={row.stage}
                          disabled={movingCompanyId === row.companyId}
                          onChange={(event) => void moveCompany(row, event.target.value as PipelineStage)}
                        >
                          {PIPELINE_STAGES.map((option) => <option key={option} value={option}>{stageLabels[option]}</option>)}
                        </select>
                      </label>
                    </article>
                  )) : (
                    <div className="pipeline-column-empty">
                      <span>Nenhuma empresa</span>
                      <small>Os cards aparecem aqui quando o estágio é atualizado.</small>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </section>
      ) : (
        <section className="attention-workspace">
          <div className="attention-list">
            {attentionItems.length ? attentionItems.map((item, index) => (
              <article key={`${item.companyId}-${item.type}-${index}`}>
                <div>
                  <Pill tone={item.tone}>{item.type}</Pill>
                  <Link to={`/companies/${item.companyId}`}>{item.company}</Link>
                  <p>{item.detail}</p>
                </div>
                <Link to={`/companies/${item.companyId}`} className="button secondary compact-button">Resolver na conta</Link>
              </article>
            )) : (
              <EmptyState title="Nenhum alerta crítico" description="As contas estão com champion, próximos passos e momentum sob controle." />
            )}
          </div>

          <aside className="pipeline-activity-panel">
            <div className="pipeline-panel-heading">
              <div>
                <p className="eyebrow">Atividade recente</p>
                <h3>O que mudou no pipeline</h3>
              </div>
              <Pill tone="info">{data.data.recentActivities.length}</Pill>
            </div>
            {data.data.recentActivities.length ? (
              <div className="pipeline-activity-list">
                {data.data.recentActivities.slice(0, 12).map((activity) => (
                  <article key={`${activity.company}-${activity.title}-${activity.when}`}>
                    <span className="activity-dot" aria-hidden="true" />
                    <div>
                      <strong>{activity.company}</strong>
                      <p>{activity.title}</p>
                      <small>{activity.owner} · {activity.when} · {activity.status}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="Sem atividades recentes" description="Registre uma atividade na conta para formar a memória operacional." />
            )}
          </aside>
        </section>
      )}
    </div>
  );
}
