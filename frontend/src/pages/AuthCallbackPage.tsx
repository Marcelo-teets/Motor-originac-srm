import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabaseAuth } from '../lib/supabaseAuth';

export function AuthCallbackPage() {
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const complete = async () => {
      try {
        const session = await supabaseAuth.sessionFromLocation();
        await acceptSession(session);
        window.history.replaceState({}, document.title, '/auth/callback');
        if (!cancelled) navigate('/', { replace: true });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível concluir o login externo.');
      }
    };
    void complete();
    return () => { cancelled = true; };
  }, [acceptSession, navigate]);

  return (
    <div className="auth-shell auth-shell-single">
      <main className="auth-panel auth-form-panel" aria-busy={!error}>
        <p className="eyebrow">OAuth</p>
        <h2>{error ? 'Falha ao concluir acesso' : 'Concluindo login seguro...'}</h2>
        <p className="auth-copy">Estamos validando a sessão do provedor externo no Supabase e carregando seu perfil de acesso.</p>
        {error ? <div className="auth-alert auth-alert-error" role="alert" aria-live="assertive">{error}</div> : <div className="auth-progress" role="status" aria-label="Validando sessão" />}
        {error ? <Link to="/login" className="button">Voltar ao login</Link> : null}
      </main>
    </div>
  );
}
