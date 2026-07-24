import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageIntro, Pill } from '../components/UI';
import { useAuth } from '../lib/auth';
import { supabaseAuth } from '../lib/supabaseAuth';

export function ChangePasswordPage() {
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    if (password.length < 10) {
      setError('Use uma senha com pelo menos 10 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('As senhas informadas não são iguais.');
      return;
    }
    if (!session?.access_token) {
      setError('Sua sessão expirou. Entre novamente para trocar a senha.');
      return;
    }

    setLoading(true);
    try {
      await supabaseAuth.updatePassword(session.access_token, password);
      setPassword('');
      setConfirmation('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <PageIntro
        eyebrow="Conta / Segurança"
        title="Alterar senha"
        description="Atualize sua credencial diretamente no Supabase Auth. A plataforma nunca armazena a senha no banco de aplicação."
        actions={<Pill tone="success">sessão autenticada</Pill>}
      />
      <div className="profile-grid">
        <Card title="Nova senha" subtitle="Use uma combinação exclusiva com pelo menos 10 caracteres.">
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              <span>Nova senha</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={10} required />
            </label>
            <label>
              <span>Confirmar nova senha</span>
              <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={10} required />
            </label>
            {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
            {success ? <div className="auth-alert auth-alert-success">Senha alterada com sucesso.</div> : null}
            <div className="actions">
              <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Alterar senha'}</button>
              <Link to="/profile" className="button secondary">Voltar ao perfil</Link>
            </div>
          </form>
        </Card>
        <Card title="Boas práticas" subtitle="Proteção da conta">
          <div className="profile-guidance">
            <p>Não reutilize a senha de e-mail, banco ou outras plataformas.</p>
            <p>Evite dados pessoais, sequências e palavras previsíveis.</p>
            <p>Ao suspeitar de acesso indevido, altere a senha e encerre a sessão.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
