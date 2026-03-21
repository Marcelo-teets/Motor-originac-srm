import { NavLink, Outlet } from 'react-router-dom';
import { navItems } from '../mocks/data';

export function Layout() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Origination Intelligence Platform</p>
          <h1>Motor SRM</h1>
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
            <p className="eyebrow">Base oficial consolidada</p>
            <strong>Frontend React/Vite + backend Node/Express + Supabase/Postgres canônico</strong>
          </div>
          <div className="badge">Mock fallback habilitado</div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
