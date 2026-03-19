import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';

const titles = {
  '/dashboard': 'Dashboard',
  '/nova-proposta': 'Nova Proposta',
  '/clientes': 'Clientes',
  '/pipeline': 'Pipeline de Originação',
};

function AppLayout() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="content-shell">
        <Header title={titles[location.pathname] || 'Motor Originação'} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
