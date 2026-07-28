import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  supabaseAuth,
  type OAuthProviderOption,
} from '../lib/supabaseAuth';

export function LoginPage() {
  const { login, loading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [oauthProviders, setOAuthProviders] = useState<OAuthProviderOption[]>([]);
  const [oauthLoading, setOAuthLoading] = useState(true);
  const [oauthUnavailable, setOAuthUnavailable] = useState(false);

  useEffect(() => {
    let active = true;

    supabaseAuth.getEnabledOAuthProviders()
      .then((providers) => {
        if (!active) return;
        setOAuthProviders(providers);
        setOAuthUnavailable(false);
      })
      .catch(() => {
        if (!active) return;
        setOAuthProviders([]);
        setOAuthUnavailable(true);
      })
      .finally(() => {
        if (active) setOAuthLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const hasOAuthProviders = oauthProviders.length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha inesperada no login.');
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-panel auth-brand-panel">
        <p className="eyebrow">Origination Intelligence Platform</p>
        <h1>Motor SRM</h1>
        <p>Inteligência institucional para encontrar, qualificar e converter oportunidades reais de crédito estruturado.</p>
        <div className="auth-feature-list">
          <span>Supabase Auth real</span>
          <span>Controle de acesso por perfil</span>
          <span>JWT único para frontend e backend</span>
        </div>
      </section>

      <section className="auth-panel auth-form-panel">
        <div>
          <p className="eyebrow">Acesso seguro</p>
          <h2>Entrar na plataforma</h2>
          <p className="auth-copy">Use seu e-mail e senha ou um provedor de acesso habilitado.</p>
        </div>

        {oauthLoading ? <div className="auth-progress" aria-label="Carregando provedores OAuth" /> : null}

        {hasOAuthProviders ? (
          <div className="oauth-provider-list">
            {oauthProviders.map(({ provider, label, mark }) => (
              <button
                key={provider}
                type="button"
                className="oauth-button"
                disabled={loading}
                onClick={() => window.location.assign(supabaseAuth.getOAuthUrl(provider))}
              >
                <span className="oauth-mark">{mark}</span>
                Continuar com {label}
              </button>
            ))}
          </div>
        ) : null}

        {oauthUnavailable ? (
          <div className="auth-alert auth-alert-warning">
            Não foi possível consultar os provedores de acesso. O formulário de e-mail e senha continua disponível.
          </div>
        ) : null}

        {hasOAuthProviders ? <div className="auth-divider"><span>ou</span></div> : null}

        <form className="form-grid" onSubmit={handleSubmit} aria-busy={loading}>
          <label>
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoFocus
              disabled={loading}
              required
            />
          </label>
          <label>
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </label>

          <div className="auth-row-between">
            <span className="table-helper">Acesso protegido pelo Supabase</span>
            <Link to="/forgot-password" className="auth-link">Esqueci minha senha</Link>
          </div>

          {error ? <div className="auth-alert auth-alert-error" role="alert">{error}</div> : null}

          <button type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </div>
  );
}
