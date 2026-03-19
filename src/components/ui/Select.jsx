export default function Select({ label, error, hint, id, children, ...props }) {
  return (
    <label className="field" htmlFor={id}>
      {label && <span className="field__label">{label}</span>}
      <select id={id} className={`field__control ${error ? 'field__control--error' : ''}`} {...props}>
        {children}
      </select>
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}
