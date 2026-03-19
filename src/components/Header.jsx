function Header({ title }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">Painel operacional</p>
        <h1>{title}</h1>
      </div>

      <div className="header-card">
        <span className="status-dot" />
        Originação online
      </div>
    </header>
  );
}

export default Header;
