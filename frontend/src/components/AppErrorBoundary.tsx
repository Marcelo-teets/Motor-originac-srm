import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[frontend-error-boundary]', {
      name: error.name,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="app-error-shell" role="alert" aria-live="assertive">
        <section className="card app-error-card">
          <p className="eyebrow">Falha controlada</p>
          <h1>Esta tela encontrou um erro inesperado</h1>
          <p>
            A plataforma preservou sua sessão e interrompeu somente a visão afetada. Recarregue a página ou volte ao cockpit.
          </p>
          <details>
            <summary>Detalhes técnicos</summary>
            <code>{this.state.error.message || this.state.error.name}</code>
          </details>
          <div className="actions">
            <button type="button" onClick={() => window.location.reload()}>Recarregar tela</button>
            <Link to="/" className="button secondary">Voltar ao cockpit</Link>
          </div>
        </section>
      </main>
    );
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary key={`${location.pathname}${location.search}`}>{children}</ErrorBoundary>;
}
