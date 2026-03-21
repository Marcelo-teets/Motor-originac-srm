import { Card } from '../components/UI';
import { searchProfileFields } from '../mocks/data';

export function SearchProfilesPage() {
  return (
    <div className="page">
      <Card title="Search Profile Builder" subtitle="Builder desktop-first com fallback mock">
        <div className="form-grid three">
          {searchProfileFields.map((field) => (
            <label key={field}><span>{field}</span><input placeholder={`Configurar ${field}`} /></label>
          ))}
        </div>
        <div className="actions"><button type="button">Salvar perfil</button><button type="button" className="secondary">Rodar busca</button></div>
      </Card>
    </div>
  );
}
