import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, PageIntro, Pill, Stat } from './UI';
import { useAuth } from '../lib/auth';
import { microsoftApi } from '../lib/microsoftApi';
import {
  taskAiApi,
  type PlannedTask,
  type TaskAiPlan,
  type TaskAiProvider,
  type TaskAiStatus,
} from '../lib/taskAiApi';

const SAMPLE_PROMPTS = [
  'Preparar uma reunião com um potencial cliente, revisar o material e organizar o follow-up.',
  'Estruturar a análise inicial de uma empresa com recebíveis e possível fit para FIDC.',
  'Organizar as pendências desta semana por prioridade, prazo e responsável.',
];

const BUCKETS: PlannedTask['bucket'][] = ['Inbox', 'Esta semana', 'Em andamento', 'Aguardando', 'Concluído'];

type EditableTask = PlannedTask & { draftId: string };
type EditablePlan = Omit<TaskAiPlan, 'plan'> & {
  plan: {
    summary: string;
    tasks: EditableTask[];
  };
};

type TaskAiComposerProps = {
  embedded?: boolean;
};

const createDraftId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const providerLabel = (provider: 'openai' | 'anthropic') => provider === 'openai' ? 'GPT' : 'Claude';

const toDateTimeLocal = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const fromDateTimeLocal = (value: string) => value ? new Date(value).toISOString() : null;

export function TaskAiComposer({ embedded = false }: TaskAiComposerProps) {
  const { session } = useAuth();
  const [status, setStatus] = useState<TaskAiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [provider, setProvider] = useState<TaskAiProvider>('auto');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<EditablePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [creatingAll, setCreatingAll] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatusLoading(true);
    void taskAiApi.getStatus(session)
      .then((nextStatus) => {
        if (active) setStatus(nextStatus);
      })
      .catch((statusError) => {
        if (active) setError(statusError instanceof Error ? statusError.message : 'Falha ao carregar os provedores de IA.');
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  const configuredProviders = useMemo(() => [
    status?.openai.configured ? 'GPT' : null,
    status?.anthropic.configured ? 'Claude' : null,
  ].filter(Boolean).join(' + '), [status]);

  const pendingTasks = useMemo(
    () => result?.plan.tasks.filter((task) => !createdIds.includes(task.draftId)) ?? [],
    [createdIds, result],
  );

  const planTasks = async () => {
    if (!prompt.trim() || planning) return;
    setPlanning(true);
    setError(null);
    setMessage(null);
    setCreatedIds([]);
    try {
      const nextResult = await taskAiApi.plan(session, prompt.trim(), provider);
      setResult({
        ...nextResult,
        plan: {
          ...nextResult.plan,
          tasks: nextResult.plan.tasks.map((task) => ({ ...task, draftId: createDraftId() })),
        },
      });
      setMessage(`${providerLabel(nextResult.provider)} organizou o pedido em ${nextResult.plan.tasks.length} tarefa(s). Revise títulos, destinos e prazos antes de criar.`);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : 'A IA não conseguiu organizar as tarefas.');
    } finally {
      setPlanning(false);
    }
  };

  const updateTask = (draftId: string, patch: Partial<PlannedTask>) => {
    setResult((current) => current ? {
      ...current,
      plan: {
        ...current.plan,
        tasks: current.plan.tasks.map((task) => task.draftId === draftId ? { ...task, ...patch } : task),
      },
    } : current);
  };

  const removeTask = (draftId: string) => {
    if (createdIds.includes(draftId)) return;
    setResult((current) => current ? {
      ...current,
      plan: {
        ...current.plan,
        tasks: current.plan.tasks.filter((task) => task.draftId !== draftId),
      },
    } : current);
  };

  const createMicrosoftTask = async (task: EditableTask) => {
    await microsoftApi.createTask(session, {
      target: task.target,
      title: task.title.trim(),
      description: task.description.trim() || undefined,
      dueDate: task.dueDate || undefined,
      importance: task.importance,
      bucket: task.target === 'planner' ? task.bucket : undefined,
    });
    setCreatedIds((current) => current.includes(task.draftId) ? current : [...current, task.draftId]);
  };

  const createOne = async (task: EditableTask) => {
    if (creatingId || creatingAll || createdIds.includes(task.draftId) || !task.title.trim()) return;
    setCreatingId(task.draftId);
    setError(null);
    try {
      await createMicrosoftTask(task);
      setMessage(`Tarefa “${task.title}” criada no ${task.target === 'todo' ? 'To Do' : 'Planner'}.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível criar a tarefa na Microsoft.');
    } finally {
      setCreatingId(null);
    }
  };

  const createAll = async () => {
    if (!result || creatingAll || !pendingTasks.length) return;
    setCreatingAll(true);
    setError(null);
    setMessage(null);
    let created = 0;
    try {
      for (const task of pendingTasks) {
        if (!task.title.trim()) continue;
        setCreatingId(task.draftId);
        await createMicrosoftTask(task);
        created += 1;
      }
      setMessage(`${created} nova(s) tarefa(s) criada(s) na Microsoft após sua aprovação.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'A criação em lote foi interrompida.');
      if (created) setMessage(`${created} tarefa(s) foram criadas antes da interrupção.`);
    } finally {
      setCreatingId(null);
      setCreatingAll(false);
    }
  };

  return (
    <div className={embedded ? 'task-ai-panel' : 'page task-ai-panel'}>
      {!embedded ? (
        <PageIntro
          eyebrow="GPT + Claude"
          title="Assistente de tarefas com IA"
          description="Descreva um objetivo em linguagem natural. A IA divide o trabalho, escolhe To Do ou Planner e apresenta tudo para sua aprovação antes de criar qualquer item."
          actions={<Pill tone={configuredProviders ? 'success' : 'warning'}>{configuredProviders || 'Chaves de IA pendentes'}</Pill>}
        />
      ) : null}

      <div className="task-feedback-stack" aria-live="polite">
        {message ? <div className="inline-notice inline-notice-success" role="status"><strong>Plano atualizado.</strong><span>{message}</span></div> : null}
        {error ? <div className="inline-notice inline-notice-error" role="alert"><strong>Atenção.</strong><span>{error}</span></div> : null}
      </div>

      <section className="task-ai-status-grid" aria-label="Provedores de inteligência artificial">
        <Stat label="GPT" value={statusLoading ? '...' : status?.openai.configured ? 'Disponível' : 'Pendente'} helper={status?.openai.model || 'OPENAI_API_KEY'} />
        <Stat label="Claude" value={statusLoading ? '...' : status?.anthropic.configured ? 'Disponível' : 'Pendente'} helper={status?.anthropic.model || 'ANTHROPIC_API_KEY'} />
        <Stat label="Aprovação" value={status?.approvalRequired === false ? 'Automática' : 'Humana'} helper="nenhuma escrita sem revisão" />
        <Stat label="Rascunhos" value={String(result?.plan.tasks.length ?? 0)} helper={`${createdIds.length} já criada(s)`} />
      </section>

      <Card title="Descrever o trabalho" subtitle="Pode ser uma tarefa simples, um projeto ou uma lista de pendências" className="task-ai-prompt-card">
        <div className="task-ai-prompt-layout">
          <div className="task-ai-prompt-main">
            <label className="task-field">
              <span>Modelo</span>
              <select value={provider} onChange={(event) => setProvider(event.target.value as TaskAiProvider)} disabled={statusLoading}>
                <option value="auto">Automático — usa o provedor disponível</option>
                <option value="openai" disabled={!status?.openai.configured}>GPT {status?.openai.configured ? `— ${status.openai.model}` : '— não configurado'}</option>
                <option value="anthropic" disabled={!status?.anthropic.configured}>Claude {status?.anthropic.configured ? `— ${status.anthropic.model}` : '— não configurado'}</option>
              </select>
            </label>
            <label className="task-field">
              <span>O que precisa ser feito?</span>
              <textarea
                rows={7}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ex.: Preciso preparar a reunião com o cliente, revisar o material, levantar pendências, dividir entregas com o time e programar o follow-up."
                maxLength={6_000}
              />
              <small>{prompt.length.toLocaleString('pt-BR')} / 6.000 caracteres</small>
            </label>
            <div className="actions">
              <button type="button" disabled={planning || !prompt.trim() || !configuredProviders} aria-busy={planning} onClick={() => void planTasks()}>
                {planning ? 'Organizando o plano...' : result ? 'Gerar novo plano' : 'Organizar tarefas com IA'}
              </button>
            </div>
            {!statusLoading && !configuredProviders ? (
              <div className="inline-notice inline-notice-warning" role="status">
                <strong>Assistente inativo.</strong>
                <span>Cadastre OPENAI_API_KEY e/ou ANTHROPIC_API_KEY na Vercel.</span>
              </div>
            ) : null}
          </div>

          <aside className="task-prompt-examples" aria-label="Exemplos de pedidos">
            <span>Exemplos práticos</span>
            {SAMPLE_PROMPTS.map((example) => (
              <button key={example} type="button" className="button-secondary" onClick={() => setPrompt(example)}>
                {example}
              </button>
            ))}
          </aside>
        </div>
      </Card>

      {result ? (
        <Card
          title="Revisar e aprovar"
          subtitle={`${providerLabel(result.provider)} · ${result.model} · nenhuma tarefa é criada automaticamente`}
          className="task-ai-plan-card"
          actions={pendingTasks.length ? <Pill tone="warning">{pendingTasks.length} pendente(s)</Pill> : <Pill tone="success">plano executado</Pill>}
        >
          <div className="task-ai-plan-summary">
            <div>
              <span>Resumo do plano</span>
              <strong>{result.plan.summary}</strong>
            </div>
            <button type="button" disabled={creatingAll || !pendingTasks.length} aria-busy={creatingAll} onClick={() => void createAll()}>
              {creatingAll ? 'Criando tarefas...' : 'Aprovar e criar pendentes'}
            </button>
          </div>

          {result.plan.tasks.length ? (
            <div className="task-ai-plan-list">
              {result.plan.tasks.map((task, index) => {
                const created = createdIds.includes(task.draftId);
                const creating = creatingId === task.draftId;
                return (
                  <article key={task.draftId} className={`task-ai-draft ${created ? 'task-ai-draft-created' : ''}`}>
                    <header>
                      <div>
                        <span className="task-ai-draft-number">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <strong>{task.title || 'Tarefa sem título'}</strong>
                          <small>{task.target === 'todo' ? 'To Do · pessoal' : `Planner · ${task.bucket}`}</small>
                        </div>
                      </div>
                      <Pill tone={created ? 'success' : task.target === 'planner' ? 'warning' : 'info'}>{created ? 'criada' : 'rascunho'}</Pill>
                    </header>

                    <div className="task-ai-editor-grid">
                      <label className="task-field task-ai-title-field">
                        <span>Título</span>
                        <input
                          value={task.title}
                          disabled={created}
                          maxLength={160}
                          onChange={(event) => updateTask(task.draftId, { title: event.target.value })}
                        />
                      </label>
                      <label className="task-field">
                        <span>Destino</span>
                        <select
                          value={task.target}
                          disabled={created}
                          onChange={(event) => updateTask(task.draftId, { target: event.target.value === 'planner' ? 'planner' : 'todo' })}
                        >
                          <option value="todo">To Do — pessoal</option>
                          <option value="planner">Planner — compartilhado</option>
                        </select>
                      </label>
                      {task.target === 'planner' ? (
                        <label className="task-field">
                          <span>Bucket</span>
                          <select value={task.bucket} disabled={created} onChange={(event) => updateTask(task.draftId, { bucket: event.target.value as PlannedTask['bucket'] })}>
                            {BUCKETS.map((name) => <option key={name} value={name}>{name}</option>)}
                          </select>
                        </label>
                      ) : (
                        <label className="task-field">
                          <span>Prioridade</span>
                          <select value={task.importance} disabled={created} onChange={(event) => updateTask(task.draftId, { importance: event.target.value === 'high' ? 'high' : 'normal' })}>
                            <option value="normal">Normal</option>
                            <option value="high">Alta</option>
                          </select>
                        </label>
                      )}
                      <label className="task-field">
                        <span>Prazo</span>
                        <input
                          type="datetime-local"
                          value={toDateTimeLocal(task.dueDate)}
                          disabled={created}
                          onChange={(event) => updateTask(task.draftId, { dueDate: fromDateTimeLocal(event.target.value) })}
                        />
                      </label>
                      <label className="task-field task-ai-description-field">
                        <span>Descrição</span>
                        <textarea
                          rows={3}
                          value={task.description}
                          disabled={created}
                          maxLength={2_000}
                          onChange={(event) => updateTask(task.draftId, { description: event.target.value })}
                        />
                      </label>
                    </div>

                    <details className="task-ai-rationale">
                      <summary>Por que esta tarefa foi sugerida?</summary>
                      <p>{task.rationale}</p>
                    </details>

                    <footer>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={created || creatingAll || creatingId !== null}
                        onClick={() => removeTask(task.draftId)}
                      >
                        Remover do plano
                      </button>
                      <button
                        type="button"
                        disabled={created || creatingAll || creatingId !== null || !task.title.trim()}
                        aria-busy={creating}
                        onClick={() => void createOne(task)}
                      >
                        {creating ? 'Criando...' : created ? 'Criada' : `Criar no ${task.target === 'todo' ? 'To Do' : 'Planner'}`}
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          ) : <EmptyState title="Plano sem tarefas" description="Gere um novo plano ou escolha outro exemplo de solicitação." />}
        </Card>
      ) : null}
    </div>
  );
}
