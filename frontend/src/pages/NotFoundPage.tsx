import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="not-found-page">
      <section className="card not-found-card">
        <p className="eyebrow">Erro 404</p>
        <h1>Esta rota não existe no Motor SRM</h1>
        <p>O endereço pode estar desatualizado ou a tela foi movida para outro ponto do fluxo de originação.</p>
        <div className="actions">
          <Link to="/" className="button">Voltar ao cockpit</Link>
          <Link to="/companies" className="button secondary">Abrir fila de leads</Link>
        </div>
      </section>
    </main>
  );
}
