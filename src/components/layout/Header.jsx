export default function Header({ title, onMenuClick }) {
  return (
    <header className="app-header">
      <div className="app-header__left">
        <button type="button" className="app-header__menu" onClick={onMenuClick}>
          ☰
        </button>
        <div>
          <span className="app-header__eyebrow">Operação</span>
          <strong>{title}</strong>
        </div>
      </div>
      <div className="app-header__right">
        <div className="app-header__search">Monitoramento diário ativo</div>
        <div className="app-header__user">
          <strong>Marina Rocha</strong>
          <span>Originação Corporate</span>
        </div>
      </div>
    </header>
  );
}
