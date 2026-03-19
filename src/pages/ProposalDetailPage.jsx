import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageContainer from '../components/layout/PageContainer';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';
import { getPropostaById } from '../services/propostasService';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function ProposalDetailPage() {
  const { id } = useParams();
  const [proposta, setProposta] = useState(undefined);

  useEffect(() => {
    getPropostaById(id).then(setProposta);
  }, [id]);

  if (proposta === undefined) {
    return (
      <PageContainer title="Carregando proposta" description="Buscando informações da operação.">
        <Card>
          <p className="muted-text">Carregando detalhes...</p>
        </Card>
      </PageContainer>
    );
  }

  if (!proposta) {
    return (
      <PageContainer title="Proposta não encontrada" description="Verifique o identificador informado.">
        <EmptyState
          title="Nenhum registro localizado"
          description="A proposta pode ter sido removida ou o link está incorreto."
          actionLabel="Voltar ao dashboard"
          onAction={() => window.history.back()}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={proposta.clienteNome}
      description={`Operação ${proposta.id} • ${proposta.produto}`}
      actions={
        <Link to="/pipeline" className="button button--secondary">
          Ver pipeline
        </Link>
      }
    >
      <div className="detail-grid">
        <Card title="Resumo da proposta" subtitle="Indicadores principais da operação" className="detail-grid__primary">
          <div className="detail-summary">
            <div>
              <span>Status</span>
              <StatusBadge status={proposta.status} />
            </div>
            <div>
              <span>Etapa atual</span>
              <strong>{proposta.etapa}</strong>
            </div>
            <div>
              <span>Valor solicitado</span>
              <strong>{formatCurrency(proposta.valor)}</strong>
            </div>
            <div>
              <span>Prazo</span>
              <strong>{proposta.prazoMeses} meses</strong>
            </div>
            <div>
              <span>Taxa indicativa</span>
              <strong>{proposta.taxaIndicativa}</strong>
            </div>
            <div>
              <span>Score interno</span>
              <strong>{proposta.score}/100</strong>
            </div>
          </div>
        </Card>

        <Card title="Contexto operacional" subtitle="Dados complementares para análise">
          <div className="key-value-list">
            <div><span>Origem</span><strong>{proposta.origem}</strong></div>
            <div><span>Responsável</span><strong>{proposta.responsavel}</strong></div>
            <div><span>Criada em</span><strong>{formatDate(proposta.criadoEm)}</strong></div>
            <div><span>Atualizada em</span><strong>{formatDate(proposta.atualizadoEm)}</strong></div>
          </div>
          <p className="detail-note">{proposta.observacoes}</p>
        </Card>
      </div>

      <Card title="Linha do tempo" subtitle="Eventos mais relevantes da proposta">
        <div className="timeline">
          {proposta.timeline.map((evento) => (
            <div key={`${evento.titulo}-${evento.data}`} className="timeline__item">
              <div className="timeline__bullet" />
              <div>
                <strong>{evento.titulo}</strong>
                <span>{formatDate(evento.data)}</span>
                <p>{evento.descricao}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </PageContainer>
  );
}
