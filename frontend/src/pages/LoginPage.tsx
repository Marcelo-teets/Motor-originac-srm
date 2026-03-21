import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function LoginPage() {
  const { login, loading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha inesperada no login.');
    }
  };

  return (
    <div className="page narrow">
      <section className="hero card">
        <p className="eyebrow">Login</p>
        <h2>Acesse a plataforma com Supabase Auth real</h2>
        <p>O frontend autentica diretamente no Supabase e mantém a sessão para consumir o backend protegido por JWT.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label><span>E-mail</span><input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label><span>Senha</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {error ? <p className="table-helper">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </section>
    </div>
  );
}
