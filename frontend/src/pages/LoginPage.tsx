import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { neonAuth } from '../lib/neonAuth';

type AccessMode = 'login' | 'register' | 'bootstrap' | 'verify';

export function LoginPage() {
  const { login, acceptSession, loading, isAuthenticated } = useAuth();
  const [mode, setMode] = useState<AccessMode>('login');
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
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
  const needsName = mode === 'register' || mode === 'bootstrap';
  const needsPassword = mode !== 'verify';

  const sendVerificationCode = async () => {
    if (!email.trim()) {
      setError('Informe o e-mail da sua conta para receber o código.');
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await neonAuth.sendEmailVerificationCode(email.trim());
      setMode('verify');
      setSuccess('Se o e-mail estiver cadastrado, o Neon enviará um código de verificação.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao solicitar código.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (mode === 'verify') {
        await neonAuth.verifyEmailCode(email.trim(), verificationCode.trim());
        setPassword('');
        setVerificationCode('');
        setMode('login');
        setSuccess('E-mail confirmado. Entre com sua senha para acessar a plataforma.');
        return;
      }
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
          <h2>{mode === 'login' ? 'Entrar na plataforma' : mode === 'bootstrap' ? 'Configurar acesso administrador' : mode === 'verify' ? 'Confirmar e-mail' : 'Solicitar acesso'}</h2>
          <p className="auth-copy">
            {mode === 'login'
              ? 'Use seu e-mail e senha. A sessão é mantida em cookie seguro no domínio do Motor.'
              : mode === 'bootstrap'
                ? 'Bootstrap privilegiado habilitado temporariamente para a configuração inicial.'
                : mode === 'verify'
                  ? 'Digite o código enviado ao seu e-mail. O Motor não recebe nem armazena esse código permanentemente.'
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

          {needsPassword ? (
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
          ) : (
            <label>
              <span>Código de verificação</span>
              <input
                type="text"
                name="verification-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,8}"
                minLength={6}
                maxLength={8}
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/[^0-9]/g, ''))}
                disabled={busy}
                required
                autoFocus
              />
            </label>
          )}

          <div className="auth-row-between">
            <span className="table-helper">Acesso protegido pelo Neon</span>
            {mode === 'login' ? <Link to="/forgot-password" className="auth-link">Esqueci minha senha</Link> : null}
          </div>

          {error ? <div className="auth-alert auth-alert-error" role="alert" aria-live="assertive">{error}</div> : null}
          {success ? <div className="auth-alert auth-alert-success" role="status">{success}</div> : null}

          <button type="submit" disabled={busy || !email.trim() || (needsPassword && !password) || (mode === 'verify' && !/^[0-9]{6,8}$/.test(verificationCode)) || (needsName && !name.trim())}>
            {busy
              ? 'Processando...'
              : mode === 'login'
                ? 'Entrar'
                : mode === 'bootstrap'
                  ? 'Criar GOD-MODE'
                  : mode === 'verify'
                    ? 'Confirmar e-mail'
                    : 'Criar cadastro pendente'}
          </button>

          {mode === 'login' ? (
            <button type="button" className="secondary" disabled={busy || !email.trim()} onClick={() => void sendVerificationCode()}>
              Enviar código para verificar meu e-mail
            </button>
          ) : null}

          {mode === 'verify' ? (
            <>
              <button type="button" className="secondary" disabled={busy} onClick={() => void sendVerificationCode()}>
                Reenviar código
              </button>
              <button type="button" className="secondary" disabled={busy} onClick={() => { setMode('login'); setError(null); setSuccess(null); }}>
                Voltar para entrar
              </button>
            </>
          ) : null}

          {!bootstrapAvailable && initialized && mode !== 'verify' ? (
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

          {!bootstrapAvailable && !initialized && mode !== 'verify' ? (
            <div className="auth-alert auth-alert-warning" role="status">
              A ativação do acesso institucional exige uma conta administrativa com e-mail verificado.
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
