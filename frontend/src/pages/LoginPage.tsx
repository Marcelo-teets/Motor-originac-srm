import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CaptchaChallenge } from '../components/CaptchaChallenge';
import { useAuth } from '../lib/auth';
import { captchaConfig, supabaseAuth } from '../lib/supabaseAuth';

export function LoginPage() {
  const { login, loading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email.trim(), password, captchaToken ?? undefined);
    } catch (err) {
      setCaptchaToken(null);
      setError(err instanceof Error ? err.message : 'Falha inesperada no login.');
    }
  };

  const captchaBlocked = captchaConfig.enabled && (!captchaConfig.siteKey || !captchaToken);

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
          <p className="auth-copy">Use seu e-mail e senha ou continue com a conta Google autorizada.</p>
        </div>

        <button type="button" className="oauth-button" onClick={() => window.location.assign(supabaseAuth.getGoogleOAuthUrl())}>
          <span className="oauth-mark">G</span>
          Continuar com Google
        </button>

        <div className="auth-divider"><span>ou</span></div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            <span>E-mail</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <label>
            <span>Senha</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </label>

          <div className="auth-row-between">
            <span className="table-helper">Acesso protegido pelo Supabase</span>
            <Link to="/forgot-password" className="auth-link">Esqueci minha senha</Link>
          </div>

          <CaptchaChallenge onToken={setCaptchaToken} />
          {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

          <button type="submit" disabled={loading || captchaBlocked}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </div>
  );
}
