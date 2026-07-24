import { useEffect, useRef } from 'react';
import { captchaConfig } from '../lib/supabaseAuth';

type CaptchaApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: CaptchaApi;
    hcaptcha?: CaptchaApi;
  }
}

const scriptId = (provider: 'turnstile' | 'hcaptcha') => `motor-${provider}-script`;
const scriptUrl = (provider: 'turnstile' | 'hcaptcha') => provider === 'hcaptcha'
  ? 'https://js.hcaptcha.com/1/api.js?render=explicit'
  : 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export function CaptchaChallenge({ onToken }: { onToken: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!captchaConfig.enabled || !captchaConfig.siteKey) return undefined;
    let cancelled = false;
    let timer: number | undefined;

    const renderWidget = () => {
      const api = captchaConfig.provider === 'hcaptcha' ? window.hcaptcha : window.turnstile;
      if (!api || !containerRef.current || widgetRef.current || cancelled) return false;
      widgetRef.current = api.render(containerRef.current, {
        sitekey: captchaConfig.siteKey,
        theme: 'dark',
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
      return true;
    };

    const existing = document.getElementById(scriptId(captchaConfig.provider)) as HTMLScriptElement | null;
    if (!existing) {
      const script = document.createElement('script');
      script.id = scriptId(captchaConfig.provider);
      script.src = scriptUrl(captchaConfig.provider);
      script.async = true;
      script.defer = true;
      script.addEventListener('load', renderWidget, { once: true });
      document.head.appendChild(script);
    } else if (!renderWidget()) {
      timer = window.setInterval(() => {
        if (renderWidget() && timer) window.clearInterval(timer);
      }, 150);
    }

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      const api = captchaConfig.provider === 'hcaptcha' ? window.hcaptcha : window.turnstile;
      if (widgetRef.current && api?.remove) api.remove(widgetRef.current);
      widgetRef.current = null;
      onToken(null);
    };
  }, [onToken]);

  if (!captchaConfig.enabled) return null;

  if (!captchaConfig.siteKey) {
    return (
      <div className="auth-alert auth-alert-warning">
        CAPTCHA está ativo no Supabase, mas a chave pública não foi configurada no frontend. Defina <code>VITE_CAPTCHA_SITE_KEY</code> na Vercel.
      </div>
    );
  }

  return <div className="captcha-container" ref={containerRef} aria-label="Desafio de segurança CAPTCHA" />;
}
