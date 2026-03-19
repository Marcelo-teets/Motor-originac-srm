function PipelineColumn({ title, items }) {
  return (
    <section className="pipeline-column">
      <div className="pipeline-column-header">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>

      <div className="pipeline-cards">
        {items.map((item) => (
          <article key={item.id} className="pipeline-card">
            <strong>{item.client}</strong>
            <p>{item.value}</p>
            <span>Responsável: {item.owner}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

export default PipelineColumn;
