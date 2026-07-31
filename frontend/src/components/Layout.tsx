import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { navItems } from '../config/nav';
import { useAuth } from '../lib/auth';
import { CommandPalette } from './CommandPalette';

const primaryPaths = ['/', '/search-profiles', '/companies', '/pipeline'];

const workflowSteps = [
  { to: '/', number: '01', label: 'Hoje', description: 'Decidir a agenda de originação' },
  { to: '/search-profiles', number: '02', label: 'Descobrir', description: 'Criar universos e capturar empresas' },
  { to: '/companies', number: '03', label: 'Priorizar & analisar', description: 'Validar tese, estrutura e timing' },
  { to: '/pipeline', number: '04', label: 'Executar', description: 'Avançar, registrar e acompanhar' },
];

const isWorkflowPath = (pathname: string) => (
  pathname === '/'
  || pathname === '/search-profiles'
  || pathname === '/companies'
  || pathname.startsWith('/companies/')
  || pathname === '/pipeline'
);

export function Layout() {
  const { logout, session, profile, isGodMode } = useAuth();
  const location = useLocation();
  const sidebarRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 1020px)').matches);
  const [expandedGroups, setExpandedGroups] = useState({ intelligence: false, operations: false });

  const visibleNavItems = useMemo(() => navItems.filter((item) => !item.godOnly || isGodMode), [isGodMode]);
  const activeItem = [...visibleNavItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))) ?? visibleNavItems[0];

  const primaryItems = useMemo(() => primaryPaths
    .map((path) => visibleNavItems.find((item) => item.to === path))
    .filter((item): item is (typeof visibleNavItems)[number] => Boolean(item)), [visibleNavItems]);
  const intelligenceItems = useMemo(() => visibleNavItems.filter((item) => (
    !primaryPaths.includes(item.to)
    && item.to !== '/profile'
    && item.group !== 'Operação & governança'
  )), [visibleNavItems]);
  const operationsItems = useMemo(() => visibleNavItems.filter((item) => (
    item.group === 'Operação & governança' && item.to !== '/profile'
  )), [visibleNavItems]);

  const shortcutLabel = useMemo(() => (/Mac|iPhone|iPad/i.test(navigator.userAgent) ? '⌘ K' : 'Ctrl K'), []);
  const environment = useMemo(() => {
    const hostname = window.location.hostname;
    if (hostname === 'motor-originac-srm.vercel.app') return { label: 'Produção', tone: 'production' };
    if (hostname === 'localhost' || hostname === '127.0.0.1') return { label: 'Desenvolvimento', tone: 'development' };
    return { label: 'Preview', tone: 'preview' };
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1020px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('menu-locked', isMobile && menuOpen);
    if (isMobile && menuOpen) {
      window.setTimeout(() => sidebarRef.current?.querySelector<HTMLElement>('a, button')?.focus(), 0);
    }
    return () => document.body.classList.remove('menu-locked');
  }, [isMobile, menuOpen]);

  useEffect(() => {
    const intelligenceActive = intelligenceItems.some((item) => location.pathname.startsWith(item.to));
    const operationsActive = operationsItems.some((item) => location.pathname.startsWith(item.to));
    setExpandedGroups((current) => {
      const next = {
        intelligence: current.intelligence || intelligenceActive,
        operations: current.operations || operationsActive,
      };
      return next.intelligence === current.intelligence && next.operations === current.operations ? current : next;
    });
  }, [intelligenceItems, location.pathname, operationsItems]);

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
      if (event.key === 'Escape' && menuOpen) {
        event.preventDefault();
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  const syncDisclosureState = (group: 'intelligence' | 'operations', isOpen: boolean) => {
    setExpandedGroups((current) => (
      current[group] === isOpen
        ? current
        : { ...current, [group]: isOpen }
    ));
  };

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
      <a href="#main-content" className="skip-link">Ir para o conteúdo</a>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      <button
        type="button"
        className="mobile-menu-button secondary"
        aria-expanded={menuOpen}
        aria-controls="main-sidebar"
        onClick={() => setMenuOpen((current) => !current)}
      >
        {menuOpen ? 'Fechar menu' : 'Menu'}
      </button>

      {menuOpen ? <button type="button" className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} /> : null}

      <aside
        ref={sidebarRef}
        id="main-sidebar"
        className={`sidebar sidebar-v3 sidebar-v4 ${menuOpen ? 'sidebar-open' : ''}`}
        aria-label="Navegação principal"
        aria-hidden={isMobile && !menuOpen ? true : undefined}
        inert={isMobile && !menuOpen ? true : undefined}
      >
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
          <kbd>{shortcutLabel}</kbd>
        </button>

        <div className={`sidebar-context environment-${environment.tone}`} title={`Ambiente atual: ${environment.label}`}>
          <span className="context-dot" aria-hidden="true" />
          <span>{environment.label}</span>
        </div>

        <div className="sidebar-section sidebar-section-v3">
          <div className="sidebar-group">
            <span className="sidebar-label">Telas principais</span>
            <nav aria-label="Fluxo principal">{primaryItems.map(renderNavItem)}</nav>
          </div>

          <details
            className="sidebar-disclosure"
            open={expandedGroups.intelligence}
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              syncDisclosureState('intelligence', isOpen);
            }}
          >
            <summary>
              <span>Inteligência e execução</span>
              <span aria-hidden="true">+</span>
            </summary>
            <nav aria-label="Inteligência e execução">{intelligenceItems.map(renderNavItem)}</nav>
          </details>

          <details
            className="sidebar-disclosure"
            open={expandedGroups.operations}
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              syncDisclosureState('operations', isOpen);
            }}
          >
            <summary>
              <span>Operação e governança</span>
              <span aria-hidden="true">+</span>
            </summary>
            <nav aria-label="Operação e governança">{operationsItems.map(renderNavItem)}</nav>
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

      <main id="main-content" className="content content-v3 content-v4" tabIndex={-1}>
        <header className="topbar topbar-v3 topbar-v4">
          <div className="topbar-title">
            <p className="eyebrow">Motor SRM / {activeItem.group}</p>
            <strong>{activeItem.label}</strong>
            <span>{activeItem.description}</span>
          </div>
          <div className="topbar-meta topbar-actions">
            <button type="button" className="secondary compact-button topbar-search" onClick={() => setCommandOpen(true)}>
              Buscar <kbd>{shortcutLabel}</kbd>
            </button>
            <Link to="/companies" className="button compact-button">Abrir fila</Link>
          </div>
        </header>

        {isWorkflowPath(location.pathname) ? (
          <nav className="workflow-rail" aria-label="Fluxo principal de originação">
            {workflowSteps.map((step) => {
              const active = step.to === '/' ? location.pathname === '/' : location.pathname === step.to || location.pathname.startsWith(`${step.to}/`);
              return (
                <Link key={step.number} to={step.to} className={active ? 'active' : ''} aria-current={active ? 'step' : undefined}>
                  <span>{step.number}</span>
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.description}</small>
                  </span>
                </Link>
              );
            })}
          </nav>
        ) : null}

        <Outlet />
      </main>
    </div>
  );
}
