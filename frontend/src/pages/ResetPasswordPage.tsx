import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabaseAuth } from '../lib/supabaseAuth';

export function ResetPasswordPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') ?? '', []);
  const invalidToken = useMemo(
    () => new URLSearchParams(window.location.search).get('error') === 'INVALID_TOKEN' || !token,
    [token],
  );
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    invalidToken ? 'Link de recuperação inválido ou expirado. Solicite um novo link.' : null,
  );
  const [success, setSuccess] = useState(false);

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
    if (!token) {
      setError('Link de recuperação inválido ou expirado. Solicite um novo link.');
      return;
    }

    setLoading(true);
    try {
      await supabaseAuth.resetPassword(token, password);
      setPassword('');
      setConfirmation('');
      setSuccess(true);
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
          <p className="auth-copy">O token do link é validado pelo Neon Auth antes da alteração.</p>
        </div>

        {success ? (
          <div className="auth-success-stack">
            <div className="auth-alert auth-alert-success">Senha atualizada com sucesso.</div>
            <Link to="/login" className="button">Entrar com a nova senha</Link>
          </div>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              <span>Nova senha</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={10} required disabled={invalidToken || loading} />
            </label>
            <label>
              <span>Confirmar nova senha</span>
              <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={10} required disabled={invalidToken || loading} />
            </label>
            {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
            <button type="submit" disabled={loading || invalidToken}>{loading ? 'Atualizando...' : 'Salvar nova senha'}</button>
            <Link to="/forgot-password" className="button secondary">Solicitar novo link</Link>
          </form>
        )}
      </section>
    </div>
  );
}
