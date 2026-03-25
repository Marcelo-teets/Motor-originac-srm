import { Card, DataStatusBanner, PageIntro } from '../components/UI';
import { MvpOpsPanel } from '../components/MvpOpsPanel';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function MvpOpsPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(
    async () => {
      const [readiness, quickActions] = await Promise.all([
        api.getMvpReadiness(session),
        api.getMvpQuickActions(session),
      ]);
      return { readiness, quickActions };
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
