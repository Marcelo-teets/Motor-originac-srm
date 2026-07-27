import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { navItems } from '../config/nav';
import { useAuth } from '../lib/auth';

const primaryPaths = ['/', '/companies', '/pipeline', '/search-profiles'];
const intelligencePaths = ['/market-map', '/watch-lists', '/dcm-daily', '/outcome-operations', '/knowledge-vault', '/knowledge-search', '/knowledge-learning', '/origination-os'];
const operationsPaths = ['/monitoring', '/capture-inbox', '/identity-review', '/credit-review', '/sources', '/agents', '/historical-archive', '/users'];

export function Layout() {
  const { logout, session, profile, isGodMode } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleNavItems = useMemo(() => navItems.filter((item) => !item.godOnly || isGodMode), [isGodMode]);
  const activeItem = [...visibleNavItems]
    .reverse()
    .find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))) ?? visibleNavItems[0];

  const primaryItems = visibleNavItems.filter((item) => primaryPaths.includes(item.to));
  const intelligenceItems = visibleNavItems.filter((item) => intelligencePaths.includes(item.to));
  const operationsItems = visibleNavItems.filter((item) => operationsPaths.includes(item.to));

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const renderNavItem = (item: (typeof visibleNavItems)[number]) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) => (isActive ? 'nav active' : 'nav')}
      end={item.to === '/'}
    >
      <span className="nav-indicator" aria-hidden="true" />
      <span className="nav-copy">
        <strong>{item.label}</strong>
        <small>{item.shortLabel}</small>
      </span>
    </NavLink>
  );

  const userName = profile?.full_name || session?.user.email || 'Usuário autenticado';
  const userInitial = (profile?.full_name ?? profile?.email ?? 'U').slice(0, 1).toUpperCase();

  return (
    <div className="shell shell-v3">
      <button
        type="button"
        className="mobile-menu-button secondary"
        aria-expanded={menuOpen}
        aria-controls="main-sidebar"
        onClick={() => setMenuOpen((current) => !current)}
      >
        {menuOpen ? 'Fechar menu' : 'Abrir menu'}
      </button>

      {menuOpen ? <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} /> : null}

      <aside id="main-sidebar" className={`sidebar sidebar-v3 ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand sidebar-brand-v3">
          <div className="brand-mark" aria-hidden="true">M</div>
          <div>
            <p className="eyebrow">Origination Intelligence</p>
            <h1>Motor SRM</h1>
          </div>
        </div>

        <div className="sidebar-context">
          <span className="context-dot" aria-hidden="true" />
          <span>Ambiente de produção</span>
        </div>

        <div className="sidebar-section sidebar-section-v3">
          <div className="sidebar-group">
            <span className="sidebar-label">Fluxo principal</span>
            <nav>{primaryItems.map(renderNavItem)}</nav>
          </div>

          <details className="sidebar-disclosure" open={intelligenceItems.some((item) => location.pathname.startsWith(item.to)) || undefined}>
            <summary>
              <span>Inteligência e cobertura</span>
              <span aria-hidden="true">+</span>
            </summary>
            <nav>{intelligenceItems.map(renderNavItem)}</nav>
          </details>

          <details className="sidebar-disclosure" open={operationsItems.some((item) => location.pathname.startsWith(item.to)) || undefined}>
            <summary>
              <span>Operação e governança</span>
              <span aria-hidden="true">+</span>
            </summary>
            <nav>{operationsItems.map(renderNavItem)}</nav>
          </details>
        </div>

        <div className="sidebar-footer sidebar-footer-v3">
          <Link to="/profile" className="sidebar-user-card">
            <span className="user-avatar-mini">{userInitial}</span>
            <span>
              <strong>{userName}</strong>
              <small>{isGodMode ? 'GOD-MODE' : 'Usuário comum'}</small>
            </span>
          </Link>
          <button type="button" className="secondary compact-button sidebar-logout" onClick={() => void logout()}>Sair</button>
        </div>
      </aside>

      <main className="content content-v3">
        <header className="topbar topbar-v3">
          <div className="topbar-title">
            <p className="eyebrow">Motor SRM / {activeItem.group}</p>
            <strong>{activeItem.label}</strong>
            <span>{activeItem.description}</span>
          </div>
          <div className="topbar-meta topbar-actions">
            <Link to="/search-profiles" className="button secondary compact-button">Novo perfil</Link>
            <Link to="/companies" className="button compact-button">Abrir leads</Link>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
