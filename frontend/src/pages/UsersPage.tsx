import { useEffect, useState } from 'react';
import { Card, ErrorState, LoadingState, PageIntro, Pill } from '../components/UI';
import { useAuth } from '../lib/auth';
import { supabaseAuth } from '../lib/supabaseAuth';
import type { UserProfile, UserStatus } from '../lib/supabaseAuth';

const roleLabel = (role: UserProfile['role']) => role === 'god_mode' ? 'GOD-MODE' : 'Usuário comum';

export function UsersPage() {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      setUsers(await supabaseAuth.listUsers(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadUsers(); }, [session?.access_token]);

  const updateStatus = async (user: UserProfile, status: UserStatus) => {
    if (!session || user.role === 'god_mode') return;
    setSavingId(user.id);
    setError(null);
    try {
      const updated = await supabaseAuth.setUserAccess(session, user.id, 'common', status);
      setUsers((current) => current?.map((item) => item.id === user.id ? { ...item, ...updated } : item) ?? current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o acesso.');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <LoadingState title="Usuários" subtitle="Carregando perfis e níveis de acesso do Supabase." />;
  if (error && !users) return <ErrorState title="Usuários" error={error} action={<button type="button" onClick={() => void loadUsers()}>Tentar novamente</button>} />;

  return (
    <div className="page">
      <PageIntro
        eyebrow="Governança / GOD-MODE"
        title="Usuários e acessos"
        description="Administração centralizada dos perfis. Existe uma única conta GOD-MODE; todas as demais contas são usuários comuns."
        actions={<Pill tone="warning">acesso exclusivo</Pill>}
      />

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <Card title="Base de usuários" subtitle={`${users?.length ?? 0} usuário(s) cadastrado(s) no Supabase Auth`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Última atualização</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.full_name || user.email || 'Sem identificação'}</strong>
                    <div className="table-helper">{user.email}</div>
                    {user.job_title ? <div className="table-helper">{user.job_title}</div> : null}
                  </td>
                  <td><Pill tone={user.role === 'god_mode' ? 'warning' : 'info'}>{roleLabel(user.role)}</Pill></td>
                  <td><Pill tone={user.status === 'active' ? 'success' : user.status === 'disabled' ? 'danger' : 'warning'}>{user.status}</Pill></td>
                  <td>{new Date(user.updated_at).toLocaleString('pt-BR')}</td>
                  <td>
                    {user.role === 'god_mode' ? (
                      <span className="table-helper">Perfil protegido</span>
                    ) : (
                      <select
                        value={user.status}
                        disabled={savingId === user.id}
                        onChange={(event) => void updateStatus(user, event.target.value as UserStatus)}
                        aria-label={`Status de ${user.email}`}
                      >
                        <option value="active">Ativo</option>
                        <option value="disabled">Desativado</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Regra de acesso" subtitle="Modelo simples para o MVP funcional">
        <div className="grid cols-2">
          <div className="profile-access-card">
            <Pill tone="warning">GOD-MODE</Pill>
            <strong>Administrador único</strong>
            <p>Acesso integral, inclusive gestão de usuários. O banco impede a criação de uma segunda conta GOD-MODE e impede a desativação da conta principal.</p>
          </div>
          <div className="profile-access-card">
            <Pill tone="info">Usuário comum</Pill>
            <strong>Acesso operacional</strong>
            <p>Usa a plataforma e edita apenas o próprio perfil. Não altera papéis, status ou dados de outras contas.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
