import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../components/layout/PageContainer';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';
import { pipelineEtapas } from '../data/propostas';
import { getPropostas } from '../services/propostasService';
import { formatCurrency } from '../utils/formatters';

export default function PipelinePage() {
  const [propostas, setPropostas] = useState([]);

  useEffect(() => {
    getPropostas().then(setPropostas);
  }, []);

  const grouped = useMemo(
    () =>
      pipelineEtapas.map((etapa) => ({
        etapa,
        items: propostas.filter((proposta) => proposta.etapa === etapa),
      })),
    [propostas],
  );

  return (
    <PageContainer
      title="Pipeline da originação"
      description="Visualize a esteira de ponta a ponta e identifique gargalos de conversão e formalização."
    >
      <div className="pipeline-grid">
        {grouped.map((column) => (
          <Card key={column.etapa} title={column.etapa} subtitle={`${column.items.length} proposta(s)`}>
            <div className="pipeline-column">
              {column.items.length ? (
                column.items.map((item) => (
                  <Link key={item.id} to={`/propostas/${item.id}`} className="pipeline-card">
                    <div>
                      <strong>{item.clienteNome}</strong>
                      <span>{item.produto}</span>
                    </div>
                    <StatusBadge status={item.status} />
                    <strong>{formatCurrency(item.valor)}</strong>
                    <small>Responsável: {item.responsavel}</small>
                  </Link>
                ))
              ) : (
                <EmptyState
                  title="Sem propostas"
                  description="Nenhuma proposta nesta etapa do pipeline no momento."
                />
              )}
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
