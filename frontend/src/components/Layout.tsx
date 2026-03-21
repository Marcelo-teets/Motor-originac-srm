import { NavLink, Outlet } from 'react-router-dom';
import { navItems } from '../mocks/data';

export function Layout() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Origination Intelligence Platform</p>
          <h1>Motor SRM</h1>
          <p className="sidebar-copy">Base oficial da `main` preservada: React/Vite no frontend, Node/Express no backend e DDL canônico em Supabase/Postgres.</p>
        </div>
        <nav>
          {navItems.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'nav active' : 'nav')} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Main oficial consolidada</p>
            <strong>Qualification Agent V1 + Pattern Identification V1 + Ranking V2 sobre a arquitetura atual</strong>
          </div>
          <div className="topbar-meta">
            <div className="badge">Supabase ready</div>
            <div className="badge subtle">Fallback mock habilitado</div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
