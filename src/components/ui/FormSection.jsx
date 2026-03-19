export default function FormSection({ title, description, children }) {
  return (
    <section className="form-section">
      <div className="form-section__header">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="form-section__content">{children}</div>
    </section>
  );
}
