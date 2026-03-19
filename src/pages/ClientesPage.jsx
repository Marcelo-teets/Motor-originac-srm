import { useEffect, useMemo, useState } from 'react';
import PageContainer from '../components/layout/PageContainer';
import Card from '../components/ui/Card';
import SearchBar from '../components/ui/SearchBar';
import StatusBadge from '../components/ui/StatusBadge';
import Table from '../components/ui/Table';
import { getClientes } from '../services/clientesService';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getClientes().then(setClientes);
  }, []);

  const filteredClientes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clientes;

    return clientes.filter((cliente) =>
      [cliente.nome, cliente.documento, cliente.segmento, cliente.cidade].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [clientes, search]);

  const columns = [
    {
      key: 'nome',
      label: 'Cliente',
      render: (row) => (
        <div>
          <strong>{row.nome}</strong>
          <div className="table__subtext">{row.documento}</div>
        </div>
      ),
    },
    { key: 'segmento', label: 'Segmento' },
    { key: 'cidade', label: 'Cidade' },
    { key: 'limitePreAprovado', label: 'Limite', render: (row) => formatCurrency(row.limitePreAprovado) },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'ultimaInteracao', label: 'Última interação', render: (row) => formatDate(row.ultimaInteracao) },
  ];

  return (
    <PageContainer
      title="Clientes"
      description="Base de empresas acompanhadas pela operação, com visão rápida de potencial e relacionamento."
    >
      <Card title="Buscar clientes" subtitle="Filtre por nome, documento, segmento ou cidade.">
        <SearchBar value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar clientes" />
      </Card>

      <Card title="Carteira ativa" subtitle={`${filteredClientes.length} cliente(s) encontrado(s).`}>
        <Table
          columns={columns}
          data={filteredClientes}
          emptyTitle="Nenhum cliente localizado"
          emptyDescription="Ajuste os filtros ou revise os dados mockados da carteira."
        />
      </Card>
    </PageContainer>
  );
}
