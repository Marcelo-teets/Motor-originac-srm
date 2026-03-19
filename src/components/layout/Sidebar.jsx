import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/propostas/nova', label: 'Nova Proposta' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/pipeline', label: 'Pipeline' },
];

export default function Sidebar({ isOpen, onClose }) {
  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__brand">
        <div className="sidebar__logo">M</div>
        <div>
          <strong>Motor Originação</strong>
          <span>SRM Platform</span>
        </div>
        <button type="button" className="sidebar__close" onClick={onClose}>
          ×
        </button>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`}
            onClick={onClose}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <span>Ambiente</span>
        <strong>Produção inicial</strong>
      </div>
    </aside>
  );
}
