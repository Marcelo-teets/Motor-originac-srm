import DataTable from '../components/DataTable';
import SectionCard from '../components/SectionCard';
import { clients } from '../services/mockData';

const clientColumns = [
  { key: 'name', label: 'Cliente' },
  { key: 'document', label: 'Documento' },
  { key: 'city', label: 'Cidade' },
  { key: 'segment', label: 'Segmento' },
  { key: 'status', label: 'Status' },
];

function ClientsPage() {
  return (
    <SectionCard
      title="Listagem de clientes"
      description="Base mockada em JSON para facilitar a futura substituição por chamadas de API."
    >
      <DataTable columns={clientColumns} rows={clients} />
    </SectionCard>
  );
}

export default ClientsPage;
