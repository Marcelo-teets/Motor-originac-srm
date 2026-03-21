import { Card, Pill } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsyncData } from '../lib/useAsyncData';

export function SourcesPage() {
  const { session } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.getSources(session), [session?.access_token]);

  if (loading) return <div className="page"><Card title="Sources" subtitle="Carregando catálogo">Aguarde...</Card></div>;
  if (error || !data) return <div className="page"><Card title="Sources" subtitle="Falha ao carregar catálogo">{error}</Card></div>;

  return (
    <div className="page">
      <Card title="Sources" subtitle="Catálogo vindo de source_catalog">
        <table><thead><tr><th>Fonte</th><th>Tipo</th><th>Categoria</th><th>Status</th><th>Health</th></tr></thead><tbody>{data.map((source) => <tr key={source.id}><td>{source.name}</td><td>{source.sourceType}</td><td>{source.category}</td><td><Pill>{source.status}</Pill></td><td>{source.health}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}
