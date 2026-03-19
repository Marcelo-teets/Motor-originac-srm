export default function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || subtitle || action) && (
        <div className="card__header">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
