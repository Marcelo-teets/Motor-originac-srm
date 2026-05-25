import { Card, Pill, Stat } from './UI';

type SystemStatusState = {
  source: 'real' | 'partial' | 'mock';
  note: string;
  data: {
    supabase: { connected: boolean; latency_ms: number };
    auth: { working: boolean };
    capture: { last_run: string | null; status: 'real' | 'partial' };
    monitoring: { active_sources: number; outputs_24h: number };
    pipeline: { rows: number };
    watchlist: { count: number; items_count: number };
  };
};

const toneFor = (value: boolean | string) => {
  if (value === true || value === 'real') return 'success' as const;
  if (value === 'partial') return 'warning' as const;
  return 'danger' as const;
};

const formatDate = (value: string | null) => {
  if (!value) return 'sem execução';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export function SystemStatusMatrix({ state }: { state: SystemStatusState }) {
  const status = state.data;

  return (
    <Card
      title="System Status"
      subtitle="Matriz operacional do Supabase, Auth, captura, monitoramento, pipeline e watchlist"
      actions={<Pill tone={toneFor(state.source)}>{state.source}</Pill>}
    >
      <div className="stack-blocks compact-gap">
        <div className="mini-metric-grid">
          <Stat
            label="Supabase"
            value={status.supabase.connected ? 'conectado' : 'offline'}
            helper={`${status.supabase.latency_ms} ms`}
          />
          <Stat
            label="Auth"
            value={status.auth.working ? 'ok' : 'falha'}
            helper="JWT validado no backend"
          />
          <Stat
            label="Captura"
            value={status.capture.status}
            helper={formatDate(status.capture.last_run)}
          />
          <Stat
            label="Monitoramento"
            value={`${status.monitoring.outputs_24h}`}
            helper={`${status.monitoring.active_sources} fontes ativas`}
          />
          <Stat
            label="Pipeline"
            value={`${status.pipeline.rows}`}
            helper="linhas persistidas"
          />
          <Stat
            label="Watchlist"
            value={`${status.watchlist.count}`}
            helper={`${status.watchlist.items_count} empresas`}
          />
        </div>
        <div className="data-banner data-banner-real">
          <Pill tone={toneFor(state.data.supabase.connected)}>Banco</Pill>
          <span>{state.note}</span>
        </div>
      </div>
    </Card>
  );
}
