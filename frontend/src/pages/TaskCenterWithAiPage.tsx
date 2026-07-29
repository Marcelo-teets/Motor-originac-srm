import { useState } from 'react';
import { PageIntro, Pill } from '../components/UI';
import { TaskAiComposer } from '../components/TaskAiComposer';
import { TaskCenterPage } from './TaskCenterPage';

type WorkspaceView = 'tasks' | 'assistant';

export function TaskCenterWithAiPage() {
  const [view, setView] = useState<WorkspaceView>('tasks');

  return (
    <div className="page task-center-workspace">
      <PageIntro
        eyebrow="Execução integrada"
        title="Central de execução"
        description="Organize tarefas pessoais no Microsoft To Do, trabalho compartilhado no Planner e use GPT ou Claude para transformar objetivos em um plano revisável antes de qualquer criação."
        actions={(
          <div className="pill-row">
            <Pill tone="info">Microsoft 365</Pill>
            <Pill tone="success">Aprovação humana</Pill>
          </div>
        )}
      />

      <div className="workspace-tabs task-center-tabs" role="tablist" aria-label="Áreas da central de execução">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'tasks'}
          className={view === 'tasks' ? 'active' : ''}
          onClick={() => setView('tasks')}
        >
          <span aria-hidden="true">01</span>
          <strong>Tarefas Microsoft</strong>
          <small>Conexão, sincronização, criação e acompanhamento.</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'assistant'}
          className={view === 'assistant' ? 'active' : ''}
          onClick={() => setView('assistant')}
        >
          <span aria-hidden="true">02</span>
          <strong>Planejar com IA</strong>
          <small>Quebrar objetivos em tarefas editáveis e aprovadas.</small>
        </button>
      </div>

      <section role="tabpanel" aria-label={view === 'tasks' ? 'Tarefas Microsoft' : 'Planejamento com IA'}>
        {view === 'tasks' ? <TaskCenterPage embedded /> : <TaskAiComposer embedded />}
      </section>
    </div>
  );
}
