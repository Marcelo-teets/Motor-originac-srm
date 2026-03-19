import { NavLink } from 'react-router-dom';

const navigationItems = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Nova Proposta', path: '/nova-proposta' },
  { label: 'Clientes', path: '/clientes' },
  { label: 'Pipeline', path: '/pipeline' },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div>
        <div className="brand-block">
          <span className="brand-badge">MO</span>
          <div>
            <strong>motor-originacao</strong>
            <p>Operação comercial</p>
          </div>
        </div>

        <nav className="nav-menu">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link-active' : ''}`.trim()
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <p>Ambiente pronto para evolução com API.</p>
      </div>
    </aside>
  );
}

export default Sidebar;
