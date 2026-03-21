import { Card } from '../components/UI';

export function PipelinePage() {
  return (
    <div className="page">
      <section className="grid cols-2">
        <Card title="Pipeline" subtitle="Estágios comerciais sincronizados com backend">
          <ul className="list">
            <li><strong>Identified</strong><span>32 empresas</span></li>
            <li><strong>Qualified</strong><span>17 empresas</span></li>
            <li><strong>Approach</strong><span>9 empresas</span></li>
            <li><strong>Structuring</strong><span>4 empresas</span></li>
          </ul>
        </Card>
        <Card title="Activities" subtitle="Ações e tarefas relacionadas">
          <ul className="list">
            <li><strong>Preparar tese executiva</strong><span>Origination · aberto</span></li>
            <li><strong>Call com CFO</strong><span>Coverage · planejado</span></li>
            <li><strong>Validar webhook Supabase</strong><span>Produto · backlog</span></li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
