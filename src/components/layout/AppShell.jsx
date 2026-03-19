import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';

const pageNames = {
  '/dashboard': 'Dashboard',
  '/clientes': 'Clientes',
  '/propostas/nova': 'Nova Proposta',
  '/pipeline': 'Pipeline da Originação',
};

export default function AppShell({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const headerTitle = useMemo(() => {
    if (location.pathname.startsWith('/propostas/')) {
      return 'Detalhe da Proposta';
    }

    return pageNames[location.pathname] ?? 'Motor Originação';
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      {isSidebarOpen && <button type="button" className="app-shell__backdrop" onClick={() => setIsSidebarOpen(false)} />}
      <div className="app-shell__content">
        <Header title={headerTitle} onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="app-shell__main">{children}</main>
      </div>
    </div>
  );
}
