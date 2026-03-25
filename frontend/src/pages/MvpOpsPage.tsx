import { Card, DataStatusBanner, PageIntro } from '../components/UI';
import { MvpOpsPanel } from '../components/MvpOpsPanel';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';
import type { ApiEnvelope, MvpQuickAction, MvpReadinessSnapshot } from '../lib/types';

const apiUrl = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type OpsPayload = {
  readiness: { source: 'real' | 'partial' | 'mock'; note: string; data: MvpReadinessSnapshot };
  quickActions: { source: 'real' | 'partial' | 'mock'; note: string; data: MvpQuickAction[] };
};

export function MvpOpsPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData<OpsPayload>(
    async () => {
      const headers = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };

      const [readinessResponse, quickActionsResponse] = await Promise.all([
        fetch(`${apiUrl}/mvp-readiness`, { headers }),
        fetch(`${apiUrl}/mvp-quick-actions`, { headers }),
      ]);

      const readinessPayload = await readinessResponse.json() as ApiEnvelope<MvpReadinessSnapshot>;
      const quickActionsPayload = await quickActionsResponse.json() as ApiEnvelope<MvpQuickAction[]>;

      return {
        readiness: {
          source: readinessPayload.status,
          note: 'Prontidão carregada diretamente da rota oficial do MVP.',
          data: readinessPayload.data,
        },
        quickActions: {
          source: quickActionsPayload.status,
          note: 'Quick actions carregadas diretamente da rota oficial do MVP.',
          data: quickActionsPayload.data,
        },
      };
    },
    [session?.access_token],
  );

  if (loading) return <div className="page"><Card title="MVP Ops" subtitle="Carregando cockpit operacional">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="MVP Ops" subtitle="Falha ao carregar prontidão operacional">{error}</Card></div>;

  return (
    <div className="page">
      <PageIntro
        eyebrow="MVP Ops"
        title="Cockpit operacional do MVP"
        description="Superfície de operação diária para acompanhar prontidão, quick actions e o estágio real de execução do Motor."
      />
      <DataStatusBanner source={data.readiness.source} note={data.readiness.note} />
      <MvpOpsPanel readiness={data.readiness.data} quickActions={data.quickActions.data} />
    </div>
  );
}
