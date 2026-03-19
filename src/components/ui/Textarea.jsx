export default function Textarea({ label, error, hint, id, ...props }) {
  return (
    <label className="field" htmlFor={id}>
      {label && <span className="field__label">{label}</span>}
      <textarea id={id} className={`field__control field__control--textarea ${error ? 'field__control--error' : ''}`} {...props} />
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}
