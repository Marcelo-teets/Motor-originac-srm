import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, PageIntro, Pill } from '../components/UI';
import { useAuth } from '../lib/auth';
import { supabaseAuth } from '../lib/supabaseAuth';

const roleLabel = (role?: string) => role === 'god_mode' ? 'GOD-MODE' : 'Usuário comum';

export function ProfilePage() {
  const { session, profile, refreshProfile, isGodMode } = useAuth();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    full_name: '',
    job_title: '',
    phone: '',
    avatar_url: '',
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(searchParams.get('password') === 'updated' ? 'Senha atualizada com sucesso.' : null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? '',
      job_title: profile.job_title ?? '',
      phone: profile.phone ?? '',
      avatar_url: profile.avatar_url ?? '',
      timezone: profile.timezone || 'America/Sao_Paulo',
      locale: profile.locale || 'pt-BR',
    });
  }, [profile]);

  const setField = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await supabaseAuth.updateProfile(session, {
        full_name: form.full_name.trim() || null,
        job_title: form.job_title.trim() || null,
        phone: form.phone.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        timezone: form.timezone,
        locale: form.locale,
      });
      await refreshProfile();
      setSuccess('Perfil atualizado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o perfil.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <PageIntro
        eyebrow="Conta"
        title="Meu perfil"
        description="Dados pessoais e profissionais usados para identificar responsáveis, owners e ações dentro da plataforma."
        actions={<Pill tone={isGodMode ? 'warning' : 'info'}>{roleLabel(profile?.role)}</Pill>}
      />

      <div className="profile-grid">
        <Card title="Informações do usuário" subtitle="Os dados de acesso são mantidos pelo Supabase Auth.">
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="grid cols-2 profile-fields">
              <label>
                <span>Nome completo</span>
                <input value={form.full_name} onChange={(event) => setField('full_name', event.target.value)} autoComplete="name" placeholder="Nome e sobrenome" />
              </label>
              <label>
                <span>Cargo</span>
                <input value={form.job_title} onChange={(event) => setField('job_title', event.target.value)} autoComplete="organization-title" placeholder="Ex.: Originação DCM" />
              </label>
              <label>
                <span>Telefone</span>
                <input value={form.phone} onChange={(event) => setField('phone', event.target.value)} autoComplete="tel" placeholder="+55 11 99999-9999" />
              </label>
              <label>
                <span>E-mail</span>
                <input value={profile?.email ?? session?.user.email ?? ''} disabled />
              </label>
              <label>
                <span>Fuso horário</span>
                <select value={form.timezone} onChange={(event) => setField('timezone', event.target.value)}>
                  <option value="America/Sao_Paulo">Brasília / São Paulo</option>
                  <option value="America/Manaus">Manaus</option>
                  <option value="America/Recife">Recife</option>
                  <option value="America/Fortaleza">Fortaleza</option>
                </select>
              </label>
              <label>
                <span>Idioma</span>
                <select value={form.locale} onChange={(event) => setField('locale', event.target.value)}>
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                </select>
              </label>
            </div>
            <label>
              <span>URL do avatar</span>
              <input type="url" value={form.avatar_url} onChange={(event) => setField('avatar_url', event.target.value)} placeholder="https://..." />
            </label>
            {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
            {success ? <div className="auth-alert auth-alert-success">{success}</div> : null}
            <div className="actions">
              <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar perfil'}</button>
              <Link to="/change-password" className="button secondary">Alterar senha</Link>
              {isGodMode ? <Link to="/users" className="button secondary">Gerenciar usuários</Link> : null}
            </div>
          </form>
        </Card>

        <Card title="Nível de acesso" subtitle="Papel controlado pelo banco e não editável pelo próprio usuário.">
          <div className="profile-summary">
            <div className="profile-avatar" aria-hidden="true">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile?.full_name ?? profile?.email ?? 'U').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{profile?.full_name || profile?.email || 'Usuário'}</strong>
              <p>{profile?.job_title || 'Cargo não informado'}</p>
            </div>
          </div>
          <div className="profile-access-card">
            <Pill tone={isGodMode ? 'warning' : 'info'}>{roleLabel(profile?.role)}</Pill>
            <p>{isGodMode ? 'Acesso total à plataforma e à administração de usuários. Este papel é exclusivo da sua conta.' : 'Acesso operacional padrão às áreas autorizadas da plataforma.'}</p>
            <span className="table-helper">Status: {profile?.status ?? 'carregando'}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
