import { useEffect, useMemo, useState } from 'react';
import { Card, DataStatusBanner, PageIntro, Pill, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';

const apiUrl = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type CatalogPayload = {
  connectors: Array<{ id: string; name: string; connectorType: string; cadence: string; parserStrategy: string }>;
  endpoints: Array<{ id: string; connectorId: string; name: string; category: string; extractionMode: string; endpointUrl: string }>;
};

type BootstrapPayload = {
  catalog: { connectors: number; endpoints: number; mode: string };
  bootstrapRuns: Array<{ sourceEndpointId: string; mode: string; simulated: boolean; documentsCreated: number; matchedRules: string[] }>;
};

export function DataIntelligencePage() {
  const { session } = useAuth();
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }), [session?.access_token]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiUrl}/data-intelligence/catalog`, { headers });
        const payload = await response.json();
        setCatalog(payload.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar catálogo.');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [headers]);

  const handleBootstrap = async () => {
    try {
      setRunning(true);
      const response = await fetch(`${apiUrl}/mvp/bootstrap`, {
        method: 'POST',
        headers,
      });
      const payload = await response.json();
      setBootstrap(payload.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao executar bootstrap.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="page"><Card title="Data Intelligence" subtitle="Carregando console operacional">Aguarde...</Card></div>;
  }

  return (
    <div className="page">
      <PageIntro
        eyebrow="Data Intelligence"
        title="Console operacional de fontes e conectores"
        description="Camada executiva do MVP para catálogo, bootstrap de conectores, runs iniciais e leitura da nova infraestrutura de dados do Motor."
        actions={<button type="button" onClick={() => void handleBootstrap()} disabled={running}>{running ? 'Executando...' : 'Executar bootstrap do MVP'}</button>}
      />

      <DataStatusBanner source="real" note="Catálogo e bootstrap consumindo a nova camada de data intelligence do backend oficial." />
      {error ? <Card title="Falha" subtitle="Erro operacional da camada de dados">{error}</Card> : null}

      <section className="grid cols-3">
        <Card title="Catálogo" subtitle="Cobertura atual da camada de fontes">
          <div className="mini-metric-grid">
            <Stat label="Connectors" value={String(catalog?.connectors.length ?? 0)} helper="fontes registradas" />
            <Stat label="Endpoints" value={String(catalog?.endpoints.length ?? 0)} helper="alvos de ingestão" />
            <Stat label="Bootstrap" value={bootstrap ? 'Executado' : 'Pendente'} helper="rodagem inicial do catálogo" />
          </div>
        </Card>

        <Card title="Bootstrap" subtitle="Última execução da orquestração inicial do MVP">
          {bootstrap ? (
            <div className="mini-metric-grid">
              <Stat label="Connectors seedados" value={String(bootstrap.catalog.connectors)} helper={bootstrap.catalog.mode} />
              <Stat label="Endpoints seedados" value={String(bootstrap.catalog.endpoints)} helper="catálogo operacional" />
              <Stat label="Runs" value={String(bootstrap.bootstrapRuns.length)} helper="executados nesta rodada" />
            </div>
          ) : (
            <p>Nenhum bootstrap executado nesta sessão.</p>
          )}
        </Card>

        <Card title="Objetivo" subtitle="Por que esta camada importa no MVP">
          <ul className="list">
            <li><strong>Fontes reais</strong><span>catalogadas e versionadas no Supabase</span></li>
            <li><strong>Ingestão</strong><span>transforma payload em raw docs e enrichment</span></li>
            <li><strong>Agentes</strong><span>aprendem com runs, feedbacks e improvement backlog</span></li>
          </ul>
        </Card>
      </section>

      <section className="grid cols-2 detail-layout">
        <Card title="Conectores" subtitle="Catálogo central da camada de dados" className="dense-card">
          <table className="dense-table">
            <thead>
              <tr><th>Nome</th><th>Tipo</th><th>Cadência</th><th>Parser</th></tr>
            </thead>
            <tbody>
              {(catalog?.connectors ?? []).map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><div className="table-helper">{item.id}</div></td>
                  <td>{item.connectorType}</td>
                  <td>{item.cadence}</td>
                  <td>{item.parserStrategy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Endpoints" subtitle="Alvos práticos de ingestão no MVP" className="dense-card">
          <table className="dense-table">
            <thead>
              <tr><th>Endpoint</th><th>Categoria</th><th>Modo</th><th>Connector</th></tr>
            </thead>
            <tbody>
              {(catalog?.endpoints ?? []).map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><div className="table-helper">{item.endpointUrl}</div></td>
                  <td>{item.category}</td>
                  <td><Pill tone="info">{item.extractionMode}</Pill></td>
                  <td>{item.connectorId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {bootstrap ? (
        <section className="grid cols-1">
          <Card title="Bootstrap Runs" subtitle="Execuções geradas pela orquestração inicial" className="dense-card">
            <table className="dense-table">
              <thead>
                <tr><th>Endpoint</th><th>Modo</th><th>Docs</th><th>Signals</th><th>Tipo</th></tr>
              </thead>
              <tbody>
                {bootstrap.bootstrapRuns.map((run) => (
                  <tr key={run.sourceEndpointId}>
                    <td>{run.sourceEndpointId}</td>
                    <td>{run.mode}</td>
                    <td>{run.documentsCreated}</td>
                    <td>{run.matchedRules.join(', ') || 'Sem match'}</td>
                    <td>{run.simulated ? 'Simulado controlado' : 'Cache/real'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
