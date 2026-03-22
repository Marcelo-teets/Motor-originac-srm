import { NavLink, Outlet } from 'react-router-dom';
import { navItems } from '../config/nav';
import { useAuth } from '../lib/auth';

export function Layout() {
  const { logout, session } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Origination Intelligence Platform</p>
          <h1>Motor SRM</h1>
          <p className="sidebar-copy">Plataforma institucional para qualificação, monitoramento e priorização executiva de oportunidades de crédito/originação.</p>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">Workspace</span>
          <nav>
            {navItems.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'nav active' : 'nav')} end={to === '/'}>
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <span className="sidebar-label">Estado da stack</span>
          <div className="sidebar-footnote">Frontend oficial da main consumindo auth e dados reais do backend; módulos avançados ainda podem operar em modo parcial.</div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Originação institucional</p>
            <strong>{session?.user.email ?? 'Usuário autenticado'} · visão de crédito, monitoramento e priorização em um só lugar</strong>
          </div>
          <div className="topbar-meta">
            <div className="badge">Desktop-first</div>
            <div className="badge subtle">Main oficial</div>
            <button type="button" className="secondary" onClick={() => void logout()}>Sair</button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
