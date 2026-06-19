import { FormEvent, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { CAPTCHA_PROVIDER, CAPTCHA_SITE_KEY } from '../lib/runtimeConfig';

type CaptchaGlobal = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    hcaptcha?: CaptchaGlobal;
    turnstile?: CaptchaGlobal;
  }
}

const captchaScriptSrc = CAPTCHA_PROVIDER === 'hcaptcha'
  ? 'https://js.hcaptcha.com/1/api.js?render=explicit'
  : CAPTCHA_PROVIDER === 'turnstile'
    ? 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    : '';
const captchaEnabled = Boolean(CAPTCHA_SITE_KEY && captchaScriptSrc);

const captchaApi = () => (CAPTCHA_PROVIDER === 'hcaptcha' ? window.hcaptcha : window.turnstile);

export function LoginPage() {
  const { login, loading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const captchaWidgetRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!captchaEnabled || captchaWidgetRef.current) return;

    const renderCaptcha = () => {
      const container = captchaContainerRef.current;
      const api = captchaApi();
      if (!container || !api || captchaWidgetRef.current) return;

      captchaWidgetRef.current = api.render(container, {
        sitekey: CAPTCHA_SITE_KEY,
        callback: (token: string) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken(''),
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${captchaScriptSrc}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', renderCaptcha, { once: true });
      renderCaptcha();
      return;
    }

    const script = document.createElement('script');
    script.src = captchaScriptSrc;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', renderCaptcha, { once: true });
    document.head.appendChild(script);
  }, []);

  const resetCaptcha = () => {
    const api = captchaApi();
    if (api && captchaWidgetRef.current) api.reset(captchaWidgetRef.current);
    setCaptchaToken('');
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (captchaEnabled && !captchaToken) {
      setError('Confirme o CAPTCHA antes de entrar.');
      return;
    }
    try {
      await login(email, password, captchaToken || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha inesperada no login.');
      resetCaptcha();
    }
  };

  return (
    <div className="page narrow">
      <section className="hero card">
        <p className="eyebrow">Login</p>
        <h2>Acesse a plataforma com Supabase Auth real</h2>
        <p>O backend autentica no Supabase e mantem a sessao em cookie seguro HttpOnly para consumir a API oficial.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label><span>E-mail</span><input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label><span>Senha</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {captchaEnabled ? <div ref={captchaContainerRef} /> : null}
          {error ? <p className="table-helper">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </section>
    </div>
  );
}
