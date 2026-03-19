export default function PageContainer({ title, description, actions, children }) {
  return (
    <div className="page-container">
      <div className="page-container__header">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-container__actions">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
