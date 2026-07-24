import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabaseAuth } from '../lib/supabaseAuth';

export function ResetPasswordPage() {
  const { session, acceptSession } = useAuth();
  const navigate = useNavigate();
  const [recoverySessionReady, setRecoverySessionReady] = useState(Boolean(session?.access_token));
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.access_token || !window.location.hash) return;
    let cancelled = false;
    const loadRecoverySession = async () => {
      try {
        const nextSession = await supabaseAuth.sessionFromLocation();
        await acceptSession(nextSession);
        window.history.replaceState({}, document.title, '/reset-password');
        if (!cancelled) setRecoverySessionReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Link de recuperação inválido ou expirado.');
      }
    };
    void loadRecoverySession();
    return () => { cancelled = true; };
  }, [acceptSession, session?.access_token]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('Use uma senha com pelo menos 10 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('As senhas informadas não são iguais.');
      return;
    }
    const accessToken = session?.access_token;
    if (!accessToken) {
      setError('A sessão de recuperação expirou. Solicite um novo link.');
      return;
    }

    setLoading(true);
    try {
      await supabaseAuth.updatePassword(accessToken, password);
      navigate('/profile?password=updated', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell auth-shell-single">
      <section className="auth-panel auth-form-panel">
        <div>
          <p className="eyebrow">Nova senha</p>
          <h2>Definir uma nova senha</h2>
          <p className="auth-copy">O link é validado pelo Supabase antes de liberar a alteração.</p>
        </div>

        {!recoverySessionReady && !error ? <div className="auth-progress" aria-label="Validando link de recuperação" /> : null}

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            <span>Nova senha</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={10} required disabled={!recoverySessionReady} />
          </label>
          <label>
            <span>Confirmar nova senha</span>
            <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={10} required disabled={!recoverySessionReady} />
          </label>
          {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
          <button type="submit" disabled={loading || !recoverySessionReady}>{loading ? 'Atualizando...' : 'Salvar nova senha'}</button>
          <Link to="/forgot-password" className="button secondary">Solicitar novo link</Link>
        </form>
      </section>
    </div>
  );
}
