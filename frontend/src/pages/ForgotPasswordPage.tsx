import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaptchaChallenge } from '../components/CaptchaChallenge';
import { captchaConfig, supabaseAuth } from '../lib/supabaseAuth';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await supabaseAuth.sendPasswordRecovery(email.trim(), captchaToken ?? undefined);
      setSent(true);
    } catch (err) {
      setCaptchaToken(null);
      setError(err instanceof Error ? err.message : 'Não foi possível iniciar a recuperação.');
    } finally {
      setLoading(false);
    }
  };

  const captchaBlocked = captchaConfig.enabled && (!captchaConfig.siteKey || !captchaToken);

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
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              <span>E-mail</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <CaptchaChallenge onToken={setCaptchaToken} />
            {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
            <button type="submit" disabled={loading || captchaBlocked}>{loading ? 'Enviando...' : 'Enviar link de recuperação'}</button>
            <Link to="/login" className="button secondary">Voltar ao login</Link>
          </form>
        )}
      </section>
    </div>
  );
}
