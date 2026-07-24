import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CaptchaChallenge } from '../components/CaptchaChallenge';
import { useAuth } from '../lib/auth';
import {
  captchaConfig,
  supabaseAuth,
  type OAuthProviderOption,
} from '../lib/supabaseAuth';

export function LoginPage() {
  const { login, loading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
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

  const emailPasswordConfigured = !captchaConfig.enabled || Boolean(captchaConfig.siteKey);
  const hasOAuthProviders = oauthProviders.length > 0;
  const captchaBlocked = captchaConfig.enabled && !captchaToken;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!emailPasswordConfigured) {
      setError('O acesso por e-mail e senha aguarda a configuração da chave pública do CAPTCHA. Use o acesso OAuth disponível acima.');
      return;
    }

    try {
      await login(email.trim(), password, captchaToken ?? undefined);
    } catch (err) {
      setCaptchaToken(null);
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
          <p className="auth-copy">Use um provedor OAuth habilitado ou, quando o CAPTCHA estiver configurado, seu e-mail e senha.</p>
        </div>

        {oauthLoading ? <div className="auth-progress" aria-label="Carregando provedores OAuth" /> : null}

        {hasOAuthProviders ? (
          <div className="oauth-provider-list">
            {oauthProviders.map(({ provider, label, mark }) => (
              <button
                key={provider}
                type="button"
                className="oauth-button"
                onClick={() => window.location.assign(supabaseAuth.getOAuthUrl(provider))}
              >
                <span className="oauth-mark">{mark}</span>
                Continuar com {label}
              </button>
            ))}
          </div>
        ) : null}

        {!emailPasswordConfigured && hasOAuthProviders ? (
          <div className="auth-alert auth-alert-warning">
            O acesso por e-mail, senha e recuperação está temporariamente indisponível até a conclusão da configuração do CAPTCHA. Use o provedor OAuth acima.
          </div>
        ) : null}

        {oauthUnavailable ? (
          <div className="auth-alert auth-alert-warning">
            {emailPasswordConfigured
              ? 'Não foi possível consultar os provedores OAuth. O acesso por e-mail e senha continua disponível.'
              : 'Não foi possível consultar os provedores OAuth e o CAPTCHA ainda não está configurado. O acesso está temporariamente indisponível.'}
          </div>
        ) : null}

        {hasOAuthProviders ? <div className="auth-divider"><span>ou</span></div> : null}

        <form className="form-grid" onSubmit={handleSubmit} aria-disabled={!emailPasswordConfigured}>
          <label>
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={!emailPasswordConfigured}
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
              disabled={!emailPasswordConfigured}
              required
            />
          </label>

          <div className="auth-row-between">
            <span className="table-helper">Acesso protegido pelo Supabase</span>
            {emailPasswordConfigured
              ? <Link to="/forgot-password" className="auth-link">Esqueci minha senha</Link>
              : <span className="table-helper">Recuperação aguardando CAPTCHA</span>}
          </div>

          <CaptchaChallenge onToken={setCaptchaToken} />
          {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

          <button type="submit" disabled={loading || !emailPasswordConfigured || captchaBlocked}>
            {loading ? 'Entrando...' : emailPasswordConfigured ? 'Entrar' : 'Aguardando configuração do CAPTCHA'}
          </button>
        </form>
      </section>
    </div>
  );
}
