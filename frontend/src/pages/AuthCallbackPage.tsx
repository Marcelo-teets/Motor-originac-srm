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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível concluir o login OAuth.');
      }
    };
    void complete();
    return () => { cancelled = true; };
  }, [acceptSession, navigate]);

  return (
    <div className="auth-shell auth-shell-single">
      <section className="auth-panel auth-form-panel">
        <p className="eyebrow">OAuth</p>
        <h2>{error ? 'Falha ao concluir acesso' : 'Concluindo login seguro...'}</h2>
        <p className="auth-copy">Estamos validando a sessão Google no Supabase e carregando seu perfil de acesso.</p>
        {error ? <div className="auth-alert auth-alert-error">{error}</div> : <div className="auth-progress" aria-label="Carregando" />}
        {error ? <Link to="/login" className="button">Voltar ao login</Link> : null}
      </section>
    </div>
  );
}
