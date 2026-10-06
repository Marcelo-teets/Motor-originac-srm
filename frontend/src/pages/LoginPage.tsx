import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { neonAuth } from '../lib/neonAuth';

type AccessMode = 'login' | 'register' | 'bootstrap';

export function LoginPage() {
  const { login, acceptSession, loading, isAuthenticated } = useAuth();
  const [mode, setMode] = useState<AccessMode>('login');
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    neonAuth.getBootstrapStatus()
      .then((status) => {
        if (cancelled) return;
        setBootstrapAvailable(status.available);
        setInitialized(status.initialized);
        if (status.available) setMode('bootstrap');
        else if (!status.initialized) setMode('login');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const busy = loading || submitting;
  const needsName = mode !== 'login';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        return;
      }

      if (password.length < 10) throw new Error('Use uma senha com pelo menos 10 caracteres.');

      if (mode === 'bootstrap') {
        const session = await neonAuth.bootstrapInitialUser(name.trim(), email.trim(), password);
        await acceptSession(session);
        return;
      }

      const result = await neonAuth.signUpWithPassword(name.trim(), email.trim(), password);
      if (result.status === 'invited') {
        setSuccess('Cadastro criado. O acesso fica pendente até a liberação pelo administrador.');
        setMode('login');
        setPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha inesperada na autenticação.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-panel auth-brand-panel" aria-label="Apresentação do Motor SRM">
        <p className="eyebrow">Origination Intelligence Platform</p>
        <h1>Motor SRM</h1>
        <p>Inteligência institucional para encontrar, qualificar e converter oportunidades reais de crédito estruturado.</p>
        <div className="auth-feature-list">
          <span>Neon Managed Auth</span>
          <span>Perfis e RBAC no Postgres</span>
          <span>Cookie HttpOnly + JWT curto</span>
        </div>
      </section>

      <main className="auth-panel auth-form-panel">
        <div>
          <p className="eyebrow">Acesso seguro</p>
          <h2>{mode === 'login' ? 'Entrar na plataforma' : mode === 'bootstrap' ? 'Configurar acesso administrador' : 'Solicitar acesso'}</h2>
          <p className="auth-copy">
            {mode === 'login'
              ? 'Use seu e-mail e senha. A sessão é mantida em cookie seguro no domínio do Motor.'
              : mode === 'bootstrap'
                ? 'Bootstrap privilegiado habilitado temporariamente para a configuração inicial.'
                : 'Novos cadastros entram como pendentes e precisam de liberação antes de acessar dados de originação.'}
          </p>
        </div>

        {bootstrapAvailable ? (
          <div className="auth-alert auth-alert-warning" role="status">
            Bootstrap GOD-MODE disponível apenas nesta janela controlada.
          </div>
        ) : null}

        <form className="form-grid" onSubmit={handleSubmit} aria-busy={busy}>
          {needsName ? (
            <label>
              <span>Nome completo</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                disabled={busy}
                required
              />
            </label>
          ) : null}

          <label>
            <span>E-mail</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              autoCapitalize="none"
              autoFocus
              disabled={busy}
              required
            />
          </label>

          <label>
            <span>Senha</span>
            <div className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'login' ? undefined : 10}
                disabled={busy}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                disabled={busy}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </label>

          <div className="auth-row-between">
            <span className="table-helper">Acesso protegido pelo Neon</span>
            {mode === 'login' ? <Link to="/forgot-password" className="auth-link">Esqueci minha senha</Link> : null}
          </div>

          {error ? <div className="auth-alert auth-alert-error" role="alert" aria-live="assertive">{error}</div> : null}
          {success ? <div className="auth-alert auth-alert-success" role="status">{success}</div> : null}

          <button type="submit" disabled={busy || !email.trim() || !password || (needsName && !name.trim())}>
            {busy
              ? 'Processando...'
              : mode === 'login'
                ? 'Entrar'
                : mode === 'bootstrap'
                  ? 'Criar GOD-MODE'
                  : 'Criar cadastro pendente'}
          </button>

          {!bootstrapAvailable && initialized ? (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setError(null);
                setSuccess(null);
                setMode((current) => current === 'login' ? 'register' : 'login');
              }}
            >
              {mode === 'login' ? 'Solicitar novo acesso' : 'Já tenho acesso'}
            </button>
          ) : null}

          {!bootstrapAvailable && !initialized ? (
            <div className="auth-alert auth-alert-warning" role="status">
              A plataforma ainda aguarda a configuração controlada do primeiro administrador.
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
