import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { navGroups, navItems } from '../config/nav';
import { useAuth } from '../lib/auth';

export function Layout() {
  const { logout, session, profile, isGodMode } = useAuth();
  const location = useLocation();
  const visibleNavItems = navItems.filter((item) => !item.godOnly || isGodMode);
  const activeItem = [...visibleNavItems]
    .reverse()
    .find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))) ?? visibleNavItems[0];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Origination Intelligence</p>
          <h1>Motor SRM</h1>
          <p className="sidebar-copy">Encontrar, explicar e converter oportunidades reais de crédito estruturado.</p>
        </div>

        <div className="sidebar-section">
          {navGroups.map((group) => (
            <div key={group} className="sidebar-group">
              <span className="sidebar-label">{group}</span>
              <nav>
                {visibleNavItems.filter((item) => item.group === group).map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav active' : 'nav')} end={item.to === '/'}>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.shortLabel}</small>
                    </span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <span className="sidebar-label">Foco da plataforma</span>
          <div className="sidebar-footnote">Brasil-only · fintechs · empresas com recebíveis · FIDC/DCM · pipeline comercial explicável.</div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-title">
            <p className="eyebrow">{activeItem.label}</p>
            <strong>{activeItem.description}</strong>
          </div>
          <div className="topbar-meta">
            <Link to="/profile" className="user-badge-link">
              <span className="user-avatar-mini">{(profile?.full_name ?? profile?.email ?? 'U').slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{profile?.full_name || session?.user.email || 'Usuário autenticado'}</strong>
                <small>{isGodMode ? 'GOD-MODE' : 'Usuário comum'}</small>
              </span>
            </Link>
            <div className="badge subtle">Main oficial</div>
            <button type="button" className="secondary compact-button" onClick={() => void logout()}>Sair</button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
