export default function SearchBar({ value, onChange, placeholder = 'Buscar...' }) {
  return (
    <div className="search-bar">
      <span className="search-bar__icon">⌕</span>
      <input value={value} onChange={onChange} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}
