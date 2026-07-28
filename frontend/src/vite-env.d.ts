/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_CAPTCHA_ENABLED?: string;
  readonly VITE_CAPTCHA_PROVIDER?: 'turnstile' | 'hcaptcha';
  readonly VITE_CAPTCHA_SITE_KEY?: string;
  readonly VITE_AUTH_CAPTCHA_ENABLED?: string;
  readonly VITE_AUTH_CAPTCHA_PROVIDER?: 'turnstile' | 'hcaptcha';
  readonly VITE_AUTH_CAPTCHA_SITE_KEY?: string;
  readonly VITE_SUPABASE_CAPTCHA_ENABLED?: string;
  readonly VITE_SUPABASE_CAPTCHA_PROVIDER?: 'turnstile' | 'hcaptcha';
  readonly VITE_SUPABASE_CAPTCHA_SITE_KEY?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_HCAPTCHA_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}