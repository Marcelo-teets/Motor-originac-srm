import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../components/layout/PageContainer';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import Table from '../components/ui/Table';
import { getClientes } from '../services/clientesService';
import { getPropostas } from '../services/propostasService';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function DashboardPage() {
  const [clientes, setClientes] = useState([]);
  const [propostas, setPropostas] = useState([]);

  useEffect(() => {
    Promise.all([getClientes(), getPropostas()]).then(([clientesData, propostasData]) => {
      setClientes(clientesData);
      setPropostas(propostasData);
    });
  }, []);

  const stats = useMemo(() => {
    const carteira = propostas.reduce((acc, proposta) => acc + proposta.valor, 0);
    const emAnalise = propostas.filter((proposta) => proposta.status === 'Em análise').length;
    const aprovadas = propostas.filter((proposta) => proposta.status === 'Aprovada' || proposta.status === 'Concluída').length;

    return [
      { title: 'Volume originado', value: formatCurrency(carteira), trend: 'Pipeline consolidado', tone: 'primary' },
      { title: 'Clientes ativos', value: String(clientes.length), trend: 'Base monitorada', tone: 'success' },
      { title: 'Em análise', value: String(emAnalise), trend: 'Mesa em andamento', tone: 'warning' },
      { title: 'Aprovadas / concluídas', value: String(aprovadas), trend: 'Conversão saudável', tone: 'default' },
    ];
  }, [clientes, propostas]);

  const latestPropostas = propostas.slice(0, 4);

  const tableColumns = [
    {
      key: 'clienteNome',
      label: 'Cliente',
      render: (row) => (
        <div>
          <strong>{row.clienteNome}</strong>
          <div className="table__subtext">{row.produto}</div>
        </div>
      ),
    },
    { key: 'valor', label: 'Valor', render: (row) => formatCurrency(row.valor) },
    { key: 'etapa', label: 'Etapa' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'atualizadoEm', label: 'Atualização', render: (row) => formatDate(row.atualizadoEm) },
    {
      key: 'action',
      label: 'Ação',
      render: (row) => (
        <Link className="table__link" to={`/propostas/${row.id}`}>
          Ver detalhes
        </Link>
      ),
    },
  ];

  return (
    <PageContainer
      title="Dashboard de originação"
      description="Acompanhe volume, produtividade da operação e propostas críticas em um único painel."
      actions={
        <Link to="/propostas/nova" className="button button--primary">
          Nova proposta
        </Link>
      }
    >
      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      <div className="dashboard-grid">
        <Card
          title="Foco do dia"
          subtitle="Resumo operacional para acompanhamento da carteira"
          className="dashboard-grid__wide"
        >
          <div className="highlights-grid">
            <div className="highlight-panel">
              <span>SLAs dentro do esperado</span>
              <strong>93% das propostas</strong>
              <p>Operação mantendo tempo de resposta abaixo do limite definido para triagem e análise.</p>
            </div>
            <div className="highlight-panel">
              <span>Maior oportunidade</span>
              <strong>{latestPropostas[0] ? latestPropostas[0].clienteNome : '—'}</strong>
              <p>{latestPropostas[0] ? `${formatCurrency(latestPropostas[0].valor)} em ${latestPropostas[0].produto}.` : 'Sem dados.'}</p>
            </div>
            <div className="highlight-panel">
              <span>Alertas relevantes</span>
              <strong>1 pendência documental</strong>
              <p>Rede Nova Educação ainda depende de documentos críticos para seguir na esteira.</p>
            </div>
          </div>
        </Card>

        <Card title="Próximas ações" subtitle="Prioridades para o time comercial e de crédito">
          <ul className="agenda-list">
            <li>Concluir análise financeira do Hospital Santa Aurora.</li>
            <li>Validar instrumentos jurídicos da Logística Horizonte.</li>
            <li>Acionar cliente com pendência documental até 16h.</li>
          </ul>
        </Card>
      </div>

      <Card title="Últimas propostas" subtitle="Monitoramento rápido do pipeline">
        <Table
          columns={tableColumns}
          data={latestPropostas}
          emptyTitle="Nenhuma proposta cadastrada"
          emptyDescription="Comece registrando a primeira oportunidade da operação."
        />
      </Card>
    </PageContainer>
  );
}
