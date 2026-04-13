import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Card, DataStatusBanner, KeyValueList, PageIntro, Pill, ProgressBar, ScoreBadge, Stat } from '../components/UI';
import { WatchListStar } from '../components/WatchListStar';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { AbmObjection, AbmStakeholder, AbmTouchpoint, CompanyDetail, PipelineStage, PreCallBriefing, PreMortem, TaskRecord } from '../lib/types';
import { useAsyncData } from '../lib/useAsyncData';

function booleanLabel(value: boolean | undefined) {
  return value ? 'Sim' : 'Não';
}
const PIPELINE_STAGES: PipelineStage[] = ['Identified', 'Qualified', 'Approach', 'Structuring', 'Mandated', 'ClosedWon', 'ClosedLost', 'Recycled'];
const toPipelineStage = (value: string): PipelineStage => (PIPELINE_STAGES.includes(value as PipelineStage) ? (value as PipelineStage) : 'Qualified');
const nextTaskStatus = (status: TaskRecord['status']): TaskRecord['status'] | null => {
  if (status === 'todo') return 'in_progress';
  if (status === 'in_progress') return 'done';
  if (status === 'blocked') return 'in_progress';
  return null;
};

export function CompanyDetailPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const { data, loading, error, setData } = useAsyncData(async () => {
    const [companyState, stakeholders, touchpoints, objections, preCall, preMortem] = await Promise.all([
      api.getCompany(session, id),
      api.getAbmStakeholders(session, id),
      api.getAbmTouchpoints(session, id),
      api.getAbmObjections(session, id),
      api.getPreCallBriefing(session, id),
      api.getPreMortem(session, id),
    ]);
    return {
      ...companyState,
      data: {
        ...companyState.data,
        abm: {
          stakeholders: stakeholders.data,
          touchpoints: touchpoints.data,
          objections: objections.data,
          preCall: preCall.data,
          preMortem: preMortem.data,
        },
      },
    };
  }, [session?.access_token, id]);

  const [stage, setStage] = useState<PipelineStage>('Qualified');
  const [nextActionDraft, setNextActionDraft] = useState('');
  const [activityTitle, setActivityTitle] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [companyTasks, setCompanyTasks] = useState<TaskRecord[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  const reloadDetail = async () => {
    const [companyState, stakeholders, touchpoints, objections, preCall, preMortem] = await Promise.all([
      api.getCompany(session, id),
      api.getAbmStakeholders(session, id),
      api.getAbmTouchpoints(session, id),
      api.getAbmObjections(session, id),
      api.getPreCallBriefing(session, id),
      api.getPreMortem(session, id),
    ]);
    setData({
      ...companyState,
      data: {
        ...companyState.data,
        abm: { stakeholders: stakeholders.data, touchpoints: touchpoints.data, objections: objections.data, preCall: preCall.data, preMortem: preMortem.data },
      },
    });
    setStage(toPipelineStage(companyState.data.company.stage ?? 'Qualified'));
    setNextActionDraft(companyState.data.company.nextAction ?? '');
    setCompanyTasks(await api.listTasks(session, id));
  };

  useEffect(() => {
    if (!data) return;
    setStage(toPipelineStage(data.data.company.stage ?? 'Qualified'));
    setNextActionDraft(data.data.company.nextAction ?? '');
    void api.listTasks(session, id).then(setCompanyTasks).catch(() => setCompanyTasks([]));
  }, [data, id, session]);

  if (loading) return <div className="page"><Card title="Company Detail" subtitle="Carregando memo executivo da companhia">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Company Detail" subtitle="Falha ao carregar company detail">{error}</Card></div>;

  const detail = data.data as CompanyDetail & {
    abm: {
      stakeholders: AbmStakeholder[];
      touchpoints: AbmTouchpoint[];
      objections: AbmObjection[];
      preCall: PreCallBriefing;
      preMortem: PreMortem;
    };
  };

  const handleRecalculate = async () => {
    await Promise.all([api.recalculateCompany(session, id), api.recalculateCommercialLayer(session, id)]);
    await reloadDetail();
  };

  const whyNow = detail.signals[0]?.note ?? detail.monitoring.feedHighlights[0] ?? detail.qualification.capital_structure_rationale;
  const structuralItems = [
    { label: 'Tem crédito?', value: booleanLabel(Boolean(detail.qualification.has_credit_product ?? true)) },
    { label: 'Tipo', value: detail.company.product },
    { label: 'Tem recebíveis?', value: `${booleanLabel((detail.company.receivables?.length ?? 0) > 0)} · ${detail.company.receivables.join(', ')}` },
    { label: 'Já tem FIDC?', value: booleanLabel(Boolean(detail.qualification.has_fidc)) },
    { label: 'Qualidade da estrutura de capital', value: detail.qualification.capital_structure_quality ?? 'Em consolidação' },
    { label: 'Funding gap', value: detail.qualification.funding_gap_level ?? 'Não informado' },
    { label: 'Fit FIDC', value: booleanLabel(detail.qualification.fit_fidc) },
    { label: 'Fit DCM', value: booleanLabel(detail.qualification.fit_dcm) },
  ];

  return (
    <div className="page">
      <PageIntro
        eyebrow="Company Detail"
        title={detail.company.name}
        description="Tela reorganizada como memo de crédito em forma de app: hierarquia executiva, recomendação clara, sinais, monitoramento e pipeline em uma leitura única."
        actions={<div className="pill-row"><WatchListStar companyId={id} companyName={detail.company.name} /><button type="button" onClick={() => void handleRecalculate()}>Recalcular scores</button></div>}
      />

      <DataStatusBanner source={data.source} note={data.note} />
      {feedback ? <div className="table-helper">{feedback}</div> : null}

      <section className="hero executive-hero">
        <div>
          <p className="eyebrow">Header executivo</p>
          <h2>{detail.company.name}</h2>
          <p className="hero-copy">{detail.company.description}</p>
          <div className="pill-row">
            <Pill tone="success">{detail.qualification.suggested_structure_type}</Pill>
            <Pill tone="warning">{detail.scores.bucket.replace(/_/g, ' ')}</Pill>
            <Pill tone="info">ranking {detail.scores.rankingScore}</Pill>
          </div>
        </div>
        <div className="executive-scores">
          <div className="score-panel"><span>Qualification Score</span><ScoreBadge value={detail.scores.qualification} kind="qualification" /></div>
          <div className="score-panel"><span>Lead Score</span><ScoreBadge value={detail.scores.lead} kind="lead" /></div>
          <div className="score-panel"><span>Priority</span><ScoreBadge value={detail.scores.bucket.replace(/_/g, ' ')} kind="priority" /></div>
          <div className="score-panel"><span>Suggested Structure</span><strong>{detail.qualification.suggested_structure_type}</strong></div>
        </div>
      </section>

      <section className="grid cols-2 detail-layout">
        <Card title="Thesis / Recommendation" subtitle="Resumo institucional, por que agora e estrutura sugerida" tone="accent" className="dense-card">
          <div className="recommendation-block">
            <div>
              <span className="section-label">Resumo institucional</span>
              <p>{detail.thesis.summary}</p>
            </div>
            <div>
              <span className="section-label">Por que agora</span>
              <p>{whyNow}</p>
            </div>
            <div>
              <span className="section-label">Estrutura sugerida</span>
              <p>{detail.thesis.structureType}</p>
            </div>
          </div>
        </Card>

        <Card title="Executive Snapshot" subtitle="CNPJ, geografia, estágio, funding atual e próxima ação" className="dense-card">
          <KeyValueList items={[
            { label: 'CNPJ', value: detail.company.cnpj },
            { label: 'Website', value: detail.company.website },
            { label: 'Geografia', value: detail.company.geography },
            { label: 'Stage', value: detail.company.stage },
            { label: 'Funding atual', value: detail.company.currentFundingStructure },
            { label: 'Próxima ação', value: detail.company.nextAction },
          ]} />
        </Card>

        <Card title="Structural Qualification" subtitle="Diagnóstico estrutural orientado a crédito/originação" className="dense-card">
          <KeyValueList items={structuralItems} />
          <div className="mini-metric-grid top-gap">
            <Stat label="Capital" value={String(detail.qualification.qualification_score_capital ?? detail.scores.qualification)} helper="qualidade da arquitetura de capital" />
            <Stat label="Recebíveis" value={String(detail.qualification.qualification_score_receivables ?? detail.scores.qualification)} helper="elegibilidade/consistência da base" />
            <Stat label="Execução" value={String(detail.qualification.qualification_score_execution ?? detail.scores.qualification)} helper="prontidão operacional" />
            <Stat label="Timing" value={String(detail.qualification.qualification_score_timing ?? detail.qualification.urgency_score)} helper="janela de abordagem" />
          </div>
        </Card>

        <Card title="Detected Patterns" subtitle="Padrões detectados, rationale e impacto na tese" className="dense-card">
          <div className="stack-blocks">
            {detail.patterns.map((pattern) => (
              <div key={pattern.id} className="pattern-card">
                <div className="row-between">
                  <strong>{pattern.patternName}</strong>
                  <Pill tone="warning">confidence {(pattern.confidenceScore * 100).toFixed(0)}%</Pill>
                </div>
                <p>{pattern.rationale}</p>
                <div className="table-helper">Impacto: +{pattern.leadScoreImpact} lead / +{pattern.rankingImpact} ranking {pattern.thesisImpact ? `· ${pattern.thesisImpact}` : ''}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Prediction" subtitle="Funding need, urgency, estrutura sugerida e próxima ação" className="dense-card">
          <div className="mini-metric-grid">
            <Stat label="Funding need score" value={String(detail.qualification.predicted_funding_need_score)} helper="pressão prevista de funding" />
            <Stat label="Urgency score" value={String(detail.qualification.urgency_score)} helper="janela de timing" />
            <Stat label="Source confidence" value={detail.qualification.source_confidence_score.toFixed(2)} helper="qualidade das evidências" />
          </div>
          <KeyValueList items={[
            { label: 'Suggested structure', value: detail.qualification.suggested_structure_type },
            { label: 'Next action', value: detail.company.nextAction },
            { label: 'Market map', value: detail.thesis.marketMapSummary },
          ]} />
        </Card>

        <Card title="Signals" subtitle="Sinais recentes, fonte e força" className="dense-card">
          <table className="dense-table">
            <thead>
              <tr><th>Sinal</th><th>Fonte</th><th>Força</th><th>Confidence</th></tr>
            </thead>
            <tbody>
              {detail.signals.map((signal, index: number) => (
                <tr key={`${signal.type}-${index}`}>
                  <td><strong>{signal.type}</strong><div className="table-helper">{signal.note}</div></td>
                  <td>{signal.source}</td>
                  <td>{signal.strength}</td>
                  <td>{signal.confidence.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Monitoring / Sources" subtitle="Fontes monitoradas, últimas mudanças e status" className="dense-card">
          <div className="split-stack">
            <div>
              <KeyValueList items={[
                { label: 'Status', value: detail.monitoring.status },
                { label: 'Última execução', value: new Date(detail.monitoring.lastRunAt).toLocaleString('pt-BR') },
                { label: 'Outputs 24h', value: detail.monitoring.outputs24h },
                { label: 'Triggers 24h', value: detail.monitoring.triggers24h },
              ]} />
            </div>
            <div className="market-map-grid no-top">
              {detail.sources.map((source) => (
                <div key={source.id} className="mini-panel">
                  <strong>{source.name}</strong>
                  <span>{source.category}</span>
                  <small>{source.status} · {source.health}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="market-map-grid">
            {detail.monitoringOutputs.map((output) => (
              <div key={output.id} className="mini-panel">
                <strong>{output.title}</strong>
                <span>{output.connectorStatus}</span>
                <small>{output.summary}</small>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Pipeline / Activities" subtitle="Estágio atual, última atividade e próxima ação" className="dense-card">
          <ul className="list">
            {detail.activities.map((activity) => (
              <li key={`${activity.title}-${activity.dueDate}`}>
                <div>
                  <strong>{activity.title}</strong>
                  <div className="table-helper">owner {activity.owner}</div>
                </div>
                <span>{activity.status} · {activity.dueDate}</span>
              </li>
            ))}
          </ul>
          <div className="top-gap">
            <div className="row-between">
              <select value={stage} onChange={(event) => setStage(toPipelineStage(event.target.value))}>
                {PIPELINE_STAGES.map((pipelineStage) => <option key={pipelineStage}>{pipelineStage}</option>)}
              </select>
              <button type="button" disabled={busyAction === 'move'} onClick={async () => {
                if (!stage) return;
                setBusyAction('move');
                try {
                  await api.movePipelineStage(session, id, stage);
                  await reloadDetail();
                  setFeedback('Estágio atualizado com sucesso.');
                } catch (err: unknown) {
                  setFeedback(err instanceof Error ? err.message : 'Falha ao mover estágio.');
                } finally { setBusyAction(null); }
              }}>Mover estágio</button>
            </div>
            <div className="row-between top-gap">
              <input value={nextActionDraft} onChange={(event) => setNextActionDraft(event.target.value)} placeholder="Atualizar próxima ação" />
              <button type="button" disabled={busyAction === 'next_action' || !nextActionDraft.trim()} onClick={async () => {
                setBusyAction('next_action');
                try {
                  await api.updateNextAction(session, id, nextActionDraft.trim());
                  await reloadDetail();
                  setFeedback('Próxima ação atualizada.');
                } catch (err: unknown) {
                  setFeedback(err instanceof Error ? err.message : 'Falha ao atualizar próxima ação.');
                } finally { setBusyAction(null); }
              }}>Salvar ação</button>
            </div>
            <div className="row-between top-gap">
              <input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} placeholder="Nova activity" />
              <button type="button" disabled={busyAction === 'activity' || !activityTitle.trim()} onClick={async () => {
                setBusyAction('activity');
                try {
                  await api.createActivity(session, { companyId: id, type: 'follow_up', title: activityTitle.trim(), description: activityTitle.trim(), owner: 'Origination', status: 'open', dueDate: null });
                  setActivityTitle('');
                  await reloadDetail();
                  setFeedback('Activity criada com sucesso.');
                } catch (err: unknown) {
                  setFeedback(err instanceof Error ? err.message : 'Falha ao criar activity.');
                } finally { setBusyAction(null); }
              }}>Criar activity</button>
            </div>
            <div className="row-between top-gap">
              <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Nova task" />
              <button type="button" disabled={busyAction === 'task' || !taskTitle.trim()} onClick={async () => {
                setBusyAction('task');
                try {
                  await api.createTask(session, { companyId: id, title: taskTitle.trim(), description: taskTitle.trim(), owner: 'Origination', status: 'todo', dueDate: null });
                  setTaskTitle('');
                  await reloadDetail();
                  setFeedback('Task criada com sucesso.');
                } catch (err: unknown) {
                  setFeedback(err instanceof Error ? err.message : 'Falha ao criar task.');
                } finally { setBusyAction(null); }
              }}>Criar task</button>
            </div>
            <div className="top-gap">
              <div className="table-helper">Tasks da companhia</div>
              <ul className="list">
                {companyTasks.map((task) => (
                  <li key={task.id}>
                    <strong>{task.title}</strong>
                    <span>{task.status} · {task.owner}</span>
                    {nextTaskStatus(task.status) ? (
                      <button
                        type="button"
                        disabled={busyAction === `task_status_${task.id}`}
                        onClick={async () => {
                          const targetStatus = nextTaskStatus(task.status);
                          if (!targetStatus) return;
                          setBusyAction(`task_status_${task.id}`);
                          try {
                            await api.updateTask(session, task.id, { status: targetStatus });
                            await reloadDetail();
                            setFeedback(`Task atualizada para ${targetStatus}.`);
                          } catch (err: unknown) {
                            setFeedback(err instanceof Error ? err.message : 'Falha ao atualizar status da task.');
                          } finally { setBusyAction(null); }
                        }}
                      >
                        Mover para {nextTaskStatus(task.status)}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card title="Score History" subtitle="Evolução de qualification e lead ao longo do tempo" className="dense-card">
          <div className="bars">
            {detail.scoreHistory.map((entry) => (
              <div key={entry.at}>
                <div className="row-between"><span>{new Date(entry.at).toLocaleDateString('pt-BR')}</span><strong>{entry.qualification}/{entry.lead}</strong></div>
                <ProgressBar value={entry.qualification} tone="default" />
                <ProgressBar value={entry.lead} tone="success" />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Stakeholder Map" subtitle="Mapa de buying committee com champion/blocker" className="dense-card">
          <table className="dense-table">
            <thead><tr><th>Nome</th><th>Papel</th><th>Champion</th><th>Blocker</th><th>Influence</th></tr></thead>
            <tbody>
              {detail.abm.stakeholders.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><div className="table-helper">{item.title ?? '-'}</div></td>
                  <td>{item.role_in_buying_committee ?? '-'}</td>
                  <td>{item.champion_score}</td>
                  <td>{item.blocker_score}</td>
                  <td>{item.influence_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Touchpoint Timeline" subtitle="Interações externas recentes com próximos passos" className="dense-card">
          <ul className="list">
            {detail.abm.touchpoints.map((item) => (
              <li key={item.id}><strong>{new Date(item.occurred_at).toLocaleDateString('pt-BR')} · {item.channel}</strong><span>{item.summary} · next: {item.agreed_next_step ?? '-'} </span></li>
            ))}
          </ul>
        </Card>

        <Card title="Objection Intelligence" subtitle="Objeções abertas e tratamento" className="dense-card">
          <ul className="list">
            {detail.abm.objections.map((item) => (
              <li key={item.id}><strong>{item.severity ?? 'n/a'} · {item.status}</strong><span>{item.objection_text}</span></li>
            ))}
          </ul>
        </Card>

        <Card title="Pre-Call Briefing" subtitle="Resumo operacional para conversa comercial" className="dense-card">
          <KeyValueList items={[
            { label: 'Resumo institucional', value: detail.abm.preCall.institutional_summary },
            { label: 'Tese atual', value: detail.abm.preCall.thesis },
            { label: 'Why now', value: detail.abm.preCall.why_now },
            { label: 'Próximo passo recomendado', value: detail.abm.preCall.recommended_next_step },
            { label: 'CTA sugerido', value: detail.abm.preCall.suggested_cta },
          ]} />
        </Card>

        <Card title="Deal Risks / Pre-Mortem" subtitle="Leitura estruturada de riscos de perda" className="dense-card">
          <ul className="list">
            {detail.abm.preMortem.risks.map((risk, index: number) => (
              <li key={index}><strong>{risk.risk}</strong><span>{risk.evidence} · Mitigação: {risk.mitigation}</span></li>
            ))}
          </ul>
        </Card>

      </section>
    </div>
  );
}
