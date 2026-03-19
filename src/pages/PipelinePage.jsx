import PipelineColumn from '../components/PipelineColumn';
import { pipelineColumns } from '../services/mockData';

function PipelinePage() {
  return (
    <div className="page-stack">
      <section className="pipeline-grid">
        {pipelineColumns.map((column) => (
          <PipelineColumn key={column.id} title={column.title} items={column.items} />
        ))}
      </section>
    </div>
  );
}

export default PipelinePage;
