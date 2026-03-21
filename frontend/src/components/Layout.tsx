import { NavLink, Outlet } from 'react-router-dom';
import { navItems } from '../config/nav';
import { useAuth } from '../lib/auth';

export function Layout() {
  const { logout, session } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Origination Intelligence Platform</p>
          <h1>Motor SRM</h1>
          <p className="sidebar-copy">Main preservada, agora conectada a Supabase/Auth reais com ingestão mínima viável de connectors.</p>
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
            <p className="eyebrow">Supabase live</p>
            <strong>{session?.user.email ?? 'Usuário autenticado'} · Qualification + patterns + monitoring persistidos</strong>
          </div>
          <div className="topbar-meta">
            <div className="badge">Auth real</div>
            <div className="badge subtle">DB first</div>
            <button type="button" className="secondary" onClick={() => void logout()}>Sair</button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
