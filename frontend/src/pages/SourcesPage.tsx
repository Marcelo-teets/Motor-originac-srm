import { Card, Pill } from '../components/UI';
import { sources } from '../mocks/data';

export function SourcesPage() {
  return (
    <div className="page">
      <Card title="Sources" subtitle="Catálogo prioritário de fontes">
        <table><thead><tr><th>Fonte</th><th>Tipo</th><th>Categoria</th><th>Status</th><th>Health</th></tr></thead><tbody>{sources.map((source) => <tr key={source.name}><td>{source.name}</td><td>{source.type}</td><td>{source.category}</td><td><Pill>{source.status}</Pill></td><td>{source.health}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}
