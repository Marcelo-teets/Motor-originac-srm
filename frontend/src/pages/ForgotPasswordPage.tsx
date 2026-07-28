import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabaseAuth } from '../lib/supabaseAuth';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await supabaseAuth.sendPasswordRecovery(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar a recuperação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell auth-shell-single">
      <section className="auth-panel auth-form-panel">
        <div>
          <p className="eyebrow">Recuperação de acesso</p>
          <h2>Recuperar senha</h2>
          <p className="auth-copy">Informe o e-mail cadastrado. O Supabase enviará um link seguro para definir uma nova senha.</p>
        </div>

        {sent ? (
          <div className="auth-success-stack">
            <div className="auth-alert auth-alert-success">Se o e-mail estiver cadastrado, o link de recuperação foi enviado.</div>
            <p className="auth-copy">Abra a mensagem no mesmo navegador e conclua a troca de senha.</p>
            <Link to="/login" className="button">Voltar ao login</Link>
          </div>
        ) : (
          <form className="form-grid" onSubmit={handleSubmit} aria-busy={loading}>
            <label>
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus
                disabled={loading}
                required
              />
            </label>
            {error ? <div className="auth-alert auth-alert-error" role="alert">{error}</div> : null}
            <button type="submit" disabled={loading}>{loading ? 'Enviando...' : 'Enviar link de recuperação'}</button>
            <Link to="/login" className="button secondary">Voltar ao login</Link>
          </form>
        )}
      </section>
    </div>
  );
}
