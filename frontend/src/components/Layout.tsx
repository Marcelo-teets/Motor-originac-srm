import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { navItems } from '../config/nav';
import { useAuth } from '../lib/auth';
import { CommandPalette } from './CommandPalette';

const primaryPaths = ['/', '/search-profiles', '/companies', '/pipeline'];
const intelligencePaths = ['/market-map', '/watch-lists', '/dcm-daily', '/outcome-operations', '/knowledge-vault', '/knowledge-search', '/knowledge-learning', '/origination-os'];
const operationsPaths = ['/monitoring', '/capture-inbox', '/identity-review', '/credit-review', '/sources', '/agents', '/historical-archive', '/users'];

const workflowSteps = [
  { to: '/', number: '01', label: 'Hoje', description: 'Decidir a agenda de originação' },
  { to: '/search-profiles', number: '02', label: 'Descobrir', description: 'Criar universos e capturar empresas' },
  { to: '/companies', number: '03', label: 'Priorizar & analisar', description: 'Validar tese, estrutura e timing' },
  { to: '/pipeline', number: '04', label: 'Executar', description: 'Avançar, registrar e acompanhar' },
];

export function Layout() {
  const { logout, session, profile, isGodMode } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const visibleNavItems = useMemo(() => navItems.filter((item) => !item.godOnly || isGodMode), [isGodMode]);
  const activeItem = [...visibleNavItems]
    .reverse()
    .find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))) ?? visibleNavItems[0];

  const primaryItems = primaryPaths
    .map((path) => visibleNavItems.find((item) => item.to === path))
    .filter((item): item is (typeof visibleNavItems)[number] => Boolean(item));
  const intelligenceItems = visibleNavItems.filter((item) => intelligencePaths.includes(item.to));
  const operationsItems = visibleNavItems.filter((item) => operationsPaths.includes(item.to));

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (!typing && event.key === '/') {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    <div className="shell shell-v4">
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

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

      <aside id="main-sidebar" className={`sidebar sidebar-v3 sidebar-v4 ${menuOpen ? 'sidebar-open' : ''}`}>
        <Link to="/" className="sidebar-brand sidebar-brand-v3 sidebar-brand-link">
          <div className="brand-mark" aria-hidden="true">M</div>
          <div>
            <p className="eyebrow">Origination Intelligence</p>
            <h1>Motor SRM</h1>
          </div>
        </Link>

        <button type="button" className="global-search-trigger" onClick={() => setCommandOpen(true)}>
          <span aria-hidden="true">⌕</span>
          <span>Buscar no Motor</span>
          <kbd>⌘ K</kbd>
        </button>

        <div className="sidebar-context">
          <span className="context-dot" aria-hidden="true" />
          <span>Produção · dados reais</span>
        </div>

        <div className="sidebar-section sidebar-section-v3">
          <div className="sidebar-group">
            <span className="sidebar-label">Telas principais</span>
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

      <main className="content content-v3 content-v4">
        <header className="topbar topbar-v3 topbar-v4">
          <div className="topbar-title">
            <p className="eyebrow">Motor SRM / {activeItem.group}</p>
            <strong>{activeItem.label}</strong>
            <span>{activeItem.description}</span>
          </div>
          <div className="topbar-meta topbar-actions">
            <button type="button" className="secondary compact-button topbar-search" onClick={() => setCommandOpen(true)}>
              Buscar <kbd>⌘ K</kbd>
            </button>
            <Link to="/companies" className="button compact-button">Abrir fila</Link>
          </div>
        </header>

        <nav className="workflow-rail" aria-label="Fluxo principal de originação">
          {workflowSteps.map((step) => {
            const active = step.to === '/' ? location.pathname === '/' : location.pathname === step.to || location.pathname.startsWith(`${step.to}/`);
            return (
              <Link key={step.number} to={step.to} className={active ? 'active' : ''}>
                <span>{step.number}</span>
                <span>
                  <strong>{step.label}</strong>
                  <small>{step.description}</small>
                </span>
              </Link>
            );
          })}
        </nav>

        <Outlet />
      </main>
    </div>
  );
}
