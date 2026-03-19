import { NavLink } from 'react-router-dom'

const items = [
  ['/', 'Dashboard'],
  ['/sources', 'Fontes'],
  ['/companies', 'Empresas'],
]

export function Layout({ children }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>Motor SRM</h1>
        <nav>
          {items.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'nav active' : 'nav'} end={to === '/'}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
