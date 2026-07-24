import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, ErrorState, LoadingState, PageIntro, Pill, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';
import {
  historicalArchiveApi,
  type ArchiveRunStatus,
  type HistoricalArchiveCatalog,
  type HistoricalArchivePart,
} from '../lib/historicalArchiveApi';

const number = new Intl.NumberFormat('pt-BR');
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const formatNumber = (value: number) => number.format(value ?? 0);
const formatDate = (value?: string | null) => value ? dateTime.format(new Date(value)) : '-';
const formatBytes = (value: number) => {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const statusTone = (status: ArchiveRunStatus) => {
  if (status === 'verified' || status === 'pruned') return 'success' as const;
  if (status === 'failed') return 'danger' as const;
  if (status === 'queued' || status === 'running' || status === 'completed') return 'warning' as const;
  return 'info' as const;
};

const statusLabel: Record<ArchiveRunStatus, string> = {
  queued: 'Na fila',
  running: 'Exportando',
  completed: 'Aguardando validação',
  verified: 'Verificado',
  pruned: 'Arquivado + limpo',
  failed: 'Falhou',
};

export function HistoricalArchivePage() {
  const { session } = useAuth();
  const [catalog, setCatalog] = useState<HistoricalArchiveCatalog | null>(null);
  const [parts, setParts] = useState<HistoricalArchivePart[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [partsLoading, setPartsLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCatalog = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      setCatalog(await historicalArchiveApi.getCatalog(session, {
        table: tableFilter || undefined,
        status: statusFilter || undefined,
        limit: 100,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o arquivo histórico.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadCatalog(); }, [session?.access_token, tableFilter, statusFilter]);

  const tables = useMemo(() => (
    Array.from(new Set((catalog?.policies ?? []).map((policy) => policy.table_name))).sort()
  ), [catalog?.policies]);

  const openParts = async (runId: string) => {
    if (!session) return;
    setSelectedRunId(runId);
    setPartsLoading(true);
    setError(null);
    try {
      const result = await historicalArchiveApi.getParts(session, runId);
      setParts(result.parts);
    } catch (err) {
      setParts([]);
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as partes do arquivo.');
    } finally {
      setPartsLoading(false);
    }
  };

  const downloadPart = async (part: HistoricalArchivePart) => {
    if (!session) return;
    setDownloadingId(part.id);
    setError(null);
    try {
      const result = await historicalArchiveApi.createDownload(session, part.id);
      window.open(result.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o download.');
    } finally {
      setDownloadingId(null);
    }
  };

  const cleanupFailed = async () => {
    if (!session) return;
    setCleaning(true);
    setNotice(null);
    setError(null);
    try {
      const result = await historicalArchiveApi.cleanupFailed(session);
      setNotice(`Limpeza concluída: ${result.deletedObjects} arquivo(s) e ${formatBytes(result.releasedBytes)} liberados.`);
      await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível limpar os artefatos falhos.');
    } finally {
      setCleaning(false);
    }
  };

  if (loading && !catalog) {
    return <LoadingState title="Arquivo histórico" subtitle="Carregando runs, políticas, checksums e arquivos Excel privados." />;
  }
  if (error && !catalog) {
    return <ErrorState title="Arquivo histórico" error={error} action={<button type="button" onClick={() => void loadCatalog()}>Tentar novamente</button>} />;
  }

  const summary = catalog?.summary;
  const selectedRun = catalog?.runs.find((run) => run.id === selectedRunId);

  return (
    <div className="page">
      <PageIntro
        eyebrow="Governança / GOD-MODE"
        title="Arquivo histórico em Excel"
        description="Camada secundária, privada e auditável para consultar dados frios sem pressionar o Supabase operacional. Cada parte possui manifesto, contagem e SHA-256."
        actions={(
          <div className="pill-row">
            <Pill tone="success">bucket privado</Pill>
            <Pill tone="info">checksum + contagem</Pill>
            <button type="button" className="secondary compact-button" disabled={cleaning} onClick={() => void cleanupFailed()}>
              {cleaning ? 'Limpando...' : 'Limpar tentativas falhas'}
            </button>
          </div>
        )}
      />

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
      {notice ? <div className="auth-alert auth-alert-success">{notice}</div> : null}

      <section className="decision-strip">
        <div className="decision-card"><Pill tone="info">Linhas arquivadas</Pill><strong>{formatNumber(summary?.archived_rows ?? 0)}</strong><small>Registros com Excel verificado.</small></div>
        <div className="decision-card"><Pill tone="success">Fora do banco quente</Pill><strong>{formatNumber(summary?.pruned_rows ?? 0)}</strong><small>Linhas brutas removidas após validação.</small></div>
        <div className="decision-card"><Pill tone="info">Arquivos</Pill><strong>{formatNumber(summary?.parts ?? 0)}</strong><small>{formatBytes(summary?.storage_bytes ?? 0)} no bucket privado.</small></div>
        <div className="decision-card"><Pill tone={summary?.failed_runs ? 'warning' : 'success'}>Saúde</Pill><strong>{summary?.failed_runs ?? 0}</strong><small>Runs falhos; artefatos podem ser limpos sem afetar dados válidos.</small></div>
      </section>

      <Card title="Filtros do catálogo" subtitle={`${catalog?.total ?? 0} execução(ões) encontrada(s)`} className="dense-card">
        <div className="grid cols-3">
          <label className="field-stack">
            <span>Tabela</span>
            <select value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}>
              <option value="">Todas</option>
              {tables.map((table) => <option key={table} value={table}>{table}</option>)}
            </select>
          </label>
          <label className="field-stack">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos</option>
              {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="profile-access-card">
            <Pill tone="warning">Regra de segurança</Pill>
            <strong>Nenhum prune sem validação</strong>
            <p>O banco exige partes, SHA-256, soma de linhas e contagem idêntica à origem no mesmo corte.</p>
          </div>
        </div>
      </Card>

      <Card title="Execuções de arquivamento" subtitle="Espelhos, payloads frios e linhas brutas já externalizadas" className="dense-card">
        {(catalog?.runs ?? []).length ? (
          <div className="table-wrap">
            <table className="dense-table">
              <thead>
                <tr><th>Base / dataset</th><th>Status</th><th>Corte</th><th>Linhas</th><th>Partes / tamanho</th><th>Concluído</th><th>Ação</th></tr>
              </thead>
              <tbody>
                {(catalog?.runs ?? []).map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{run.table_name}</strong>
                      <div className="table-helper">{run.dataset_code ?? '*'} · {run.requested_by ?? 'system'}</div>
                      {run.error_message ? <div className="table-helper">erro: {run.error_message}</div> : null}
                    </td>
                    <td><Pill tone={statusTone(run.status)}>{statusLabel[run.status]}</Pill></td>
                    <td>{formatDate(run.cutoff_at)}</td>
                    <td>{formatNumber(run.row_count)}</td>
                    <td>{formatNumber(run.part_count)} · {formatBytes(run.size_bytes)}</td>
                    <td>{formatDate(run.pruned_at ?? run.verified_at ?? run.completed_at)}</td>
                    <td>
                      {run.part_count > 0 ? (
                        <button type="button" className="secondary compact-button" onClick={() => void openParts(run.id)}>
                          Ver arquivos
                        </button>
                      ) : <span className="table-helper">Sem partes ativas</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Nenhum arquivo encontrado" description="Ajuste os filtros ou aguarde o próximo ciclo de retenção." />}
      </Card>

      {selectedRunId ? (
        <Card
          title={`Partes do arquivo · ${selectedRun?.dataset_code ?? selectedRun?.table_name ?? selectedRunId}`}
          subtitle="Links assinados expiram em cinco minutos e preservam o bucket privado."
          className="dense-card"
        >
          {partsLoading ? <LoadingState title="Partes do Excel" subtitle="Consultando manifesto e checksums." /> : parts.length ? (
            <div className="table-wrap">
              <table className="dense-table">
                <thead><tr><th>Parte</th><th>Arquivo</th><th>Linhas</th><th>Período</th><th>Tamanho</th><th>SHA-256</th><th>Download</th></tr></thead>
                <tbody>
                  {parts.map((part) => (
                    <tr key={part.id}>
                      <td>{part.part_number}</td>
                      <td><strong>{part.workbook_name}</strong></td>
                      <td>{formatNumber(part.row_count)}</td>
                      <td>{formatDate(part.min_record_at)} → {formatDate(part.max_record_at)}</td>
                      <td>{formatBytes(part.size_bytes)}</td>
                      <td><span className="table-helper">{part.sha256.slice(0, 12)}…{part.sha256.slice(-8)}</span></td>
                      <td>
                        <button type="button" className="secondary compact-button" disabled={downloadingId === part.id} onClick={() => void downloadPart(part)}>
                          {downloadingId === part.id ? 'Gerando...' : 'Baixar Excel'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="Sem partes ativas" description="A execução pode ter falhado e seus artefatos já terem sido limpos." />}
        </Card>
      ) : null}

      <Card title="Políticas de retenção" subtitle="O que fica no Supabase e o que pode migrar para Excel" className="dense-card">
        <div className="table-wrap">
          <table className="dense-table">
            <thead><tr><th>Tabela</th><th>Dataset</th><th>Modo</th><th>Janela quente</th><th>Prune permitido</th><th>Regra</th></tr></thead>
            <tbody>
              {(catalog?.policies ?? []).map((policy) => (
                <tr key={`${policy.table_name}:${policy.dataset_code}`}>
                  <td><strong>{policy.table_name}</strong></td>
                  <td>{policy.dataset_code}</td>
                  <td><Pill tone={policy.retention_mode === 'mirror_only' ? 'info' : 'warning'}>{policy.retention_mode}</Pill></td>
                  <td>{policy.hot_retention_days ? `${policy.hot_retention_days} dias` : 'online'}</td>
                  <td><Pill tone={policy.allow_prune ? 'success' : 'info'}>{policy.allow_prune ? 'sim' : 'não'}</Pill></td>
                  <td><div className="table-helper">{policy.notes ?? '-'}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
