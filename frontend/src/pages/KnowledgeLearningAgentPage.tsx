import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, PageIntro, Pill, Stat } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { knowledgeLearningApi } from '../lib/knowledgeLearningApi';
import type { KnowledgeLearningStatus } from '../lib/knowledgeLearningTypes';
import type { CompanyListItem } from '../lib/types';
import '../styles/knowledge-learning-agent.css';

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'não informado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'data inválida';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const runTone = (status: string) => {
  if (status === 'completed') return 'success' as const;
  if (status === 'failed') return 'danger' as const;
  if (status === 'partial') return 'warning' as const;
  return 'info' as const;
};

export function KnowledgeLearningAgentPage() {
  const { session } = useAuth();
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState<KnowledgeLearningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedCompany = useMemo(() => companies.find((company) => company.id === companyId) ?? null, [companies, companyId]);

  const load = useCallback(async () => {
    const [companyEnvelope, learningStatus] = await Promise.all([
      api.getCompanies(session),
      knowledgeLearningApi.status(session, companyId || null),
    ]);
    setCompanies(companyEnvelope.data);
    setStatus(learningStatus);
  }, [companyId, session]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void load()
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o agente.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [load]);

  const enqueue = async () => {
    if (!companyId) {
      setError('Selecione uma empresa antes de solicitar a atualização do mapa.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await knowledgeLearningApi.enqueue(session, companyId);
      setNotice(`Atualização de ${selectedCompany?.name ?? 'empresa'} adicionada à fila governada.`);
      setStatus(await knowledgeLearningApi.status(session, companyId));
    } catch (enqueueError) {
      setError(enqueueError instanceof Error ? enqueueError.message : 'Falha ao enfileirar atualização.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page knowledge-learning-page">
      <PageIntro
        eyebrow="Knowledge Learning Agent V14"
        title="IA que mantém os mind maps vivos"
        description="O agente acompanha novas buscas, capturas, outputs e sinais; separa fatos de hipóteses; atualiza notas, evidências e relações do Knowledge Vault com versionamento e lineage."
        actions={<div className="page-intro-actions"><Pill tone="success">Supabase real</Pill><Pill tone="info">LLM estruturada</Pill><Link className="button secondary" to="/knowledge-vault">Abrir Vault</Link></div>}
      />

      <Card title="Controle do aprendizado" subtitle="Atualização contínua da memória — sem treinamento de pesos e sem mutação de score" tone="accent">
        <div className="knowledge-learning-control">
          <label>
            <span>Escopo</span>
            <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              <option value="">Operação inteira</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={!companyId || busy} onClick={() => void enqueue()}>
            {busy ? 'Enfileirando...' : 'Atualizar mapa desta empresa'}
          </button>
        </div>
        <div className="knowledge-learning-guardrail">
          <Pill tone="warning">guardrail</Pill>
          <span>A IA aprende a memória institucional e o grafo. Qualification, patterns, lead score, ranking e pipeline não são alterados automaticamente.</span>
        </div>
      </Card>

      {error ? <div className="data-banner data-banner-warning" role="alert"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {notice ? <div className="data-banner data-banner-success" role="status"><Pill tone="success">ok</Pill><span>{notice}</span></div> : null}
      {loading ? <p className="table-helper">Carregando fila, runs e lineage...</p> : null}

      {!loading && status ? (
        <>
          <section className="mini-metric-grid knowledge-learning-metrics">
            <Stat label="Pendentes" value={String(status.queue.pending)} helper="capturas aguardando LLM" />
            <Stat label="Processando" value={String(status.queue.processing)} helper="leases ativos" />
            <Stat label="Concluídos hoje" value={String(status.completedToday)} helper="limite diário governado" />
            <Stat label="Falhas" value={String(status.queue.failed)} helper={`${status.queue.deadLetter} dead letters`} />
            <Stat label="Histórico concluído" value={String(status.queue.completed)} helper="jobs preservados" />
            <Stat label="Último modelo" value={status.lastRun?.model ?? 'sem run'} helper={formatDate(status.lastRun?.finishedAt ?? status.lastRun?.startedAt)} />
          </section>

          <Card title="Última atualização" subtitle={selectedCompany ? `Mapa de ${selectedCompany.name}` : 'Último mapa processado na operação'}>
            {status.lastRun ? (
              <div className="knowledge-learning-last-run">
                <div>
                  <div className="pill-row"><Pill tone={runTone(status.lastRun.status)}>{status.lastRun.status}</Pill><Pill tone="default">{status.lastRun.companyName}</Pill></div>
                  <strong>{status.lastRun.nodesCreated} nós criados · {status.lastRun.nodesUpdated} atualizados</strong>
                  <span>{status.lastRun.linksApplied} relações · {status.lastRun.referencesApplied} evidências aplicadas</span>
                  {status.lastRun.error ? <small>{status.lastRun.error}</small> : null}
                </div>
                <Link className="button" to="/knowledge-vault">Ver mind map</Link>
              </div>
            ) : <EmptyState title="Nenhum run concluído neste escopo." description="As capturas qualificadas entram automaticamente na fila; também é possível enfileirar uma empresa manualmente." />}
          </Card>

          <Card title="Runs recentes" subtitle="Auditoria de modelo, empresa, nós, relações e evidências">
            {status.recentRuns.length ? (
              <div className="knowledge-learning-runs">
                {status.recentRuns.map((run) => (
                  <article key={run.id}>
                    <div>
                      <strong>{run.companyName}</strong>
                      <span>{run.model} · {formatDate(run.startedAt)}</span>
                      <small>{run.nodesCreated} criados · {run.nodesUpdated} atualizados · {run.linksApplied} links · {run.referencesApplied} referências</small>
                    </div>
                    <Pill tone={runTone(run.status)}>{run.status}</Pill>
                  </article>
                ))}
              </div>
            ) : <EmptyState title="Sem histórico de aprendizado." description="O primeiro run aparecerá após o worker processar uma captura ou solicitação manual." />}
          </Card>
        </>
      ) : null}
    </div>
  );
}
