import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, ErrorState, LoadingState, PageIntro, Pill } from '../components/UI';
import { useAuth } from '../lib/auth';
import {
  historicalArchiveApi,
  type ArchiveRunStatus,
  type ArchiveStorageProvider,
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

const storageHealthTone = (state?: string | null) => {
  if (state === 'healthy') return 'success' as const;
  if (state === 'warning') return 'warning' as const;
  if (state === 'critical' || state === 'quota_exceeded') return 'danger' as const;
  return 'info' as const;
};

const providerLabel: Record<ArchiveStorageProvider, string> = {
  google_drive: 'Google Drive',
  supabase_storage: 'Storage legado',
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
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o arquivo.');
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
    return <LoadingState title="Arquivo histórico" subtitle="Carregando uso, políticas, checksums e arquivos privados." />;
  }
  if (error && !catalog) {
    return <ErrorState title="Arquivo histórico" error={error} action={<button type="button" onClick={() => void loadCatalog()}>Tentar novamente</button>} />;
  }

  const summary = catalog?.summary;
  const storageHealth = catalog?.storage_health;
  const selectedRun = catalog?.runs.find((run) => run.id === selectedRunId);

  return (
    <div className="page">
      <PageIntro
        eyebrow="Governança / GOD-MODE"
        title="Arquivo histórico e limite gratuito"
        description="O Supabase permanece como banco quente. Dados brutos e payloads antigos são validados, arquivados no Google Drive e removidos do banco operacional sem perder lineage ou capacidade de consulta."
        actions={(
          <div className="pill-row">
            <Pill tone="success">Google Drive privado</Pill>
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
        <div className="decision-card">
          <Pill tone={storageHealthTone(storageHealth?.state)}>Banco operacional</Pill>
          <strong>{formatBytes(storageHealth?.database_bytes ?? 0)}</strong>
          <small>Meta: {formatBytes(storageHealth?.target_bytes ?? 0)} · limite gratuito: {formatBytes(storageHealth?.free_quota_bytes ?? 0)}.</small>
        </div>
        <div className="decision-card"><Pill tone="success">Fora do banco quente</Pill><strong>{formatNumber(summary?.pruned_rows ?? 0)}</strong><small>Linhas removidas somente após validação.</small></div>
        <div className="decision-card"><Pill tone="info">Google Drive</Pill><strong>{formatBytes(summary?.google_drive_bytes ?? 0)}</strong><small>Arquivo frio, privado e consultável.</small></div>
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

      <Card title="Execuções de arquivamento" subtitle="Espelhos, payloads frios e linhas brutas externalizadas" className="dense-card">
        {(catalog?.runs ?? []).length ? (
          <div className="table-wrap">
            <table className="dense-table">
              <thead>
                <tr><th>Base / dataset</th><th>Destino</th><th>Status</th><th>Corte</th><th>Linhas</th><th>Partes / tamanho</th><th>Concluído</th><th>Ação</th></tr>
              </thead>
              <tbody>
                {(catalog?.runs ?? []).map((run) => (
                  <tr key={run.id}>
                    <td>
                      <strong>{run.table_name}</strong>
                      <div className="table-helper">{run.dataset_code ?? '*'} · {run.requested_by ?? 'system'}</div>
                      {run.error_message ? <div className="table-helper">erro: {run.error_message}</div> : null}
                    </td>
                    <td><Pill tone={run.storage_provider === 'google_drive' ? 'success' : 'info'}>{providerLabel[run.storage_provider]}</Pill></td>
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
          subtitle="Arquivos do Google Drive abrem na pasta privada; arquivos legados usam link assinado de cinco minutos."
          className="dense-card"
        >
          {partsLoading ? <LoadingState title="Partes do Excel" subtitle="Consultando manifesto e checksums." /> : parts.length ? (
            <div className="table-wrap">
              <table className="dense-table">
                <thead><tr><th>Parte</th><th>Arquivo</th><th>Destino</th><th>Linhas</th><th>Período</th><th>Tamanho</th><th>SHA-256</th><th>Abrir</th></tr></thead>
                <tbody>
                  {parts.map((part) => (
                    <tr key={part.id}>
                      <td>{part.part_number}</td>
                      <td><strong>{part.workbook_name}</strong></td>
                      <td><Pill tone={part.storage_provider === 'google_drive' ? 'success' : 'info'}>{providerLabel[part.storage_provider]}</Pill></td>
                      <td>{formatNumber(part.row_count)}</td>
                      <td>{formatDate(part.min_record_at)} → {formatDate(part.max_record_at)}</td>
                      <td>{formatBytes(part.size_bytes)}</td>
                      <td><span className="table-helper">{part.sha256.slice(0, 12)}…{part.sha256.slice(-8)}</span></td>
                      <td>
                        <button type="button" className="secondary compact-button" disabled={downloadingId === part.id} onClick={() => void downloadPart(part)}>
                          {downloadingId === part.id ? 'Abrindo...' : part.storage_provider === 'google_drive' ? 'Abrir no Drive' : 'Baixar Excel'}
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

      <Card title="Políticas de retenção" subtitle="O que fica no Supabase e o que migra para o arquivo frio" className="dense-card">
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
