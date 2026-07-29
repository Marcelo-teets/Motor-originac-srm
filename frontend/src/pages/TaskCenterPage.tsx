import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, PageIntro, Pill, ProgressBar, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';
import {
  microsoftApi,
  type MicrosoftConnectionStatus,
  type MicrosoftWorkspace,
  type PlannerTask,
  type TodoTask,
} from '../lib/microsoftApi';

const DEFAULT_BUCKETS = ['Inbox', 'Esta semana', 'Em andamento', 'Aguardando', 'Concluído'];

type TaskFilter = 'open' | 'overdue' | 'completed' | 'all';

type TaskCenterPageProps = {
  embedded?: boolean;
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value?: string | null) => {
  const date = parseDate(value);
  if (!date) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const todoCompleted = (task: TodoTask) => task.status === 'completed';
const plannerCompleted = (task: PlannerTask) => Number(task.percentComplete ?? 0) >= 100;
const isOverdue = (value: string | null | undefined, completed: boolean) => {
  const date = parseDate(value);
  return Boolean(date && !completed && date.getTime() < Date.now());
};

const matchesFilter = (filter: TaskFilter, completed: boolean, overdue: boolean) => {
  if (filter === 'open') return !completed;
  if (filter === 'overdue') return overdue;
  if (filter === 'completed') return completed;
  return true;
};

const sortTasks = <T,>(
  items: T[],
  completed: (item: T) => boolean,
  dueDate: (item: T) => string | null | undefined,
) => items.slice().sort((left, right) => {
  const completedDiff = Number(completed(left)) - Number(completed(right));
  if (completedDiff !== 0) return completedDiff;

  const leftOverdue = isOverdue(dueDate(left), completed(left));
  const rightOverdue = isOverdue(dueDate(right), completed(right));
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;

  const leftDate = parseDate(dueDate(left))?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDate = parseDate(dueDate(right))?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftDate - rightDate;
});

export function TaskCenterPage({ embedded = false }: TaskCenterPageProps) {
  const { session } = useAuth();
  const [status, setStatus] = useState<MicrosoftConnectionStatus | null>(null);
  const [workspace, setWorkspace] = useState<MicrosoftWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupId, setGroupId] = useState('');
  const [target, setTarget] = useState<'todo' | 'planner'>('todo');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [importance, setImportance] = useState<'normal' | 'high'>('normal');
  const [bucket, setBucket] = useState('Inbox');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('open');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    if (!session) {
      setStatus(null);
      setWorkspace(null);
      return;
    }

    setError(null);
    const nextStatus = await microsoftApi.getStatus(session);
    setStatus(nextStatus);
    setGroupId(nextStatus.connection?.plannerGroupId ?? '');

    if (!nextStatus.connected) {
      setWorkspace(null);
      return;
    }

    try {
      setWorkspace(await microsoftApi.getWorkspace(session));
    } catch (workspaceError) {
      setWorkspace(null);
      setError(workspaceError instanceof Error ? workspaceError.message : 'Falha ao carregar tarefas Microsoft.');
    }
  }, [session]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a integração Microsoft.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const microsoftResult = query.get('microsoft');
    const oauthMessage = query.get('message');

    if (microsoftResult === 'connected') {
      setMessage('Conta Microsoft conectada. Agora valide a estrutura do To Do e do Planner.');
    }
    if (microsoftResult === 'error') {
      setError(oauthMessage || 'A Microsoft recusou ou interrompeu a conexão.');
    }

    if (microsoftResult || oauthMessage) {
      query.delete('microsoft');
      query.delete('message');
      const nextSearch = query.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
      );
    }
  }, []);

  useEffect(() => {
    if (target === 'planner' && workspace && !workspace.planner.enabled) setTarget('todo');
  }, [target, workspace]);

  const runAction = async (name: string, action: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(name);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'A ação falhou.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleConnect = () => runAction('connect', async () => {
    const result = await microsoftApi.connect(session);
    window.location.assign(result.authorizationUrl);
  });

  const handleBootstrap = () => runAction('bootstrap', async () => {
    await microsoftApi.bootstrap(session, groupId.trim() || undefined);
    setMessage('Estrutura validada: lista do To Do, plano do Planner e buckets padrão foram verificados.');
    await load();
  });

  const handleSync = () => runAction('sync', async () => {
    const result = await microsoftApi.sync(session);
    setMessage(`Sincronização concluída: ${result.todoItemsRead} item(ns) do To Do e ${result.plannerItemsRead} do Planner.`);
    await load();
  });

  const handleDisconnect = () => runAction('disconnect', async () => {
    await microsoftApi.disconnect(session);
    setConfirmDisconnect(false);
    setMessage('Conta Microsoft desconectada e tokens removidos da plataforma.');
    await load();
  });

  const handleCreateTask = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;

    void runAction('create-task', async () => {
      await microsoftApi.createTask(session, {
        target,
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        importance,
        bucket: target === 'planner' ? bucket : undefined,
        groupId: target === 'planner' && groupId.trim() ? groupId.trim() : undefined,
      });
      setTitle('');
      setDescription('');
      setDueDate('');
      setImportance('normal');
      setMessage(`Tarefa criada no Microsoft ${target === 'todo' ? 'To Do' : 'Planner'}.`);
      await load();
    });
  };

  const plannerBuckets = useMemo(() => {
    const items = workspace?.planner.buckets ?? [];
    return new Map(items.map((item) => [item.id, item.name]));
  }, [workspace]);

  const bucketOptions = useMemo(() => {
    const names = workspace?.planner.buckets.map((item) => item.name).filter(Boolean) ?? [];
    return names.length ? Array.from(new Set(names)) : DEFAULT_BUCKETS;
  }, [workspace]);

  const todoTasks = workspace?.todo.tasks ?? [];
  const plannerTasks = workspace?.planner.tasks ?? [];

  const taskMetrics = useMemo(() => {
    const normalized = [
      ...todoTasks.map((task) => ({ completed: todoCompleted(task), dueDate: task.dueDateTime?.dateTime })),
      ...plannerTasks.map((task) => ({ completed: plannerCompleted(task), dueDate: task.dueDateTime })),
    ];
    return {
      open: normalized.filter((task) => !task.completed).length,
      overdue: normalized.filter((task) => isOverdue(task.dueDate, task.completed)).length,
      completed: normalized.filter((task) => task.completed).length,
      total: normalized.length,
    };
  }, [plannerTasks, todoTasks]);

  const visibleTodoTasks = useMemo(() => sortTasks(
    todoTasks.filter((task) => {
      const completed = todoCompleted(task);
      return matchesFilter(taskFilter, completed, isOverdue(task.dueDateTime?.dateTime, completed));
    }),
    todoCompleted,
    (task) => task.dueDateTime?.dateTime,
  ), [taskFilter, todoTasks]);

  const visiblePlannerTasks = useMemo(() => sortTasks(
    plannerTasks.filter((task) => {
      const completed = plannerCompleted(task);
      return matchesFilter(taskFilter, completed, isOverdue(task.dueDateTime, completed));
    }),
    plannerCompleted,
    (task) => task.dueDateTime,
  ), [plannerTasks, taskFilter]);

  if (loading) {
    return (
      <div className={embedded ? 'task-center-panel' : 'page task-center-panel'} aria-busy="true">
        <Card title="Central de tarefas" subtitle="Validando conexão Microsoft e carregando a fila oficial">
          <div className="state-box state-loading" role="status" aria-live="polite">
            <span className="loading-dot" aria-hidden="true" />
            <div>
              <strong>Sincronizando o workspace...</strong>
              <p>Estamos verificando To Do, Planner, listas, plano e buckets configurados.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={embedded ? 'task-center-panel' : 'page task-center-panel'}>
      {!embedded ? (
        <PageIntro
          eyebrow="Execução pessoal e compartilhada"
          title="Central de tarefas Microsoft"
          description="Use o To Do para suas tarefas pessoais e o Planner para projetos, responsáveis e trabalho em equipe, sem duplicar a fonte oficial."
          actions={<Pill tone={status?.connected ? 'success' : 'warning'}>{status?.connected ? 'Microsoft conectado' : 'Conexão pendente'}</Pill>}
        />
      ) : null}

      <div className="task-feedback-stack" aria-live="polite">
        {message ? <div className="inline-notice inline-notice-success" role="status"><strong>Concluído.</strong><span>{message}</span></div> : null}
        {error ? <div className="inline-notice inline-notice-error" role="alert"><strong>Atenção.</strong><span>{error}</span></div> : null}
      </div>

      <section className="task-metric-strip" aria-label="Resumo das tarefas">
        <Stat label="Em aberto" value={String(taskMetrics.open)} helper={`${taskMetrics.total} tarefa(s) sincronizada(s)`} />
        <Stat label="Atrasadas" value={String(taskMetrics.overdue)} helper="prazo vencido e ainda pendente" />
        <Stat label="Concluídas" value={String(taskMetrics.completed)} helper="To Do e Planner somados" />
        <Stat label="Última sincronização" value={status?.connection?.lastSyncAt ? formatDate(status.connection.lastSyncAt) : 'Nunca'} helper={status?.connected ? 'Microsoft Graph' : 'conecte uma conta'} />
      </section>

      <Card
        title="Conexão Microsoft"
        subtitle="Conta, permissões e estado da integração oficial"
        className="task-connection-card"
        actions={<Pill tone={status?.connected ? 'success' : status?.configured ? 'warning' : 'danger'}>{status?.connected ? 'conectado' : status?.configured ? 'aguardando OAuth' : 'configuração pendente'}</Pill>}
      >
        <div className="task-account-summary">
          <div className="task-account-avatar" aria-hidden="true">MS</div>
          <div>
            <strong>{status?.connection?.displayName || 'Conta Microsoft 365'}</strong>
            <span>{status?.connection?.accountEmail || 'Nenhuma conta conectada'}</span>
          </div>
          <div className="task-account-meta">
            <span>To Do</span>
            <strong>{status?.connection?.todoListId ? 'Pronto' : 'Pendente'}</strong>
          </div>
          <div className="task-account-meta">
            <span>Planner</span>
            <strong>{status?.connection?.plannerPlanId ? 'Pronto' : 'Pendente'}</strong>
          </div>
        </div>

        {!status?.configured ? (
          <div className="inline-notice inline-notice-warning" role="status">
            <strong>Variáveis pendentes na Vercel.</strong>
            <span>{status?.missingConfig.join(', ') || 'A configuração Microsoft ainda não foi encontrada.'}</span>
          </div>
        ) : null}

        {status?.connection?.lastError ? (
          <div className="inline-notice inline-notice-error" role="alert">
            <strong>Último erro da integração.</strong>
            <span>{status.connection.lastError}</span>
          </div>
        ) : null}

        <div className="task-connection-actions">
          {!status?.connected ? (
            <button
              type="button"
              disabled={busyAction !== null || !status?.configured}
              aria-busy={busyAction === 'connect'}
              onClick={() => void handleConnect()}
            >
              {busyAction === 'connect' ? 'Abrindo Microsoft...' : 'Conectar Microsoft'}
            </button>
          ) : (
            <>
              <button type="button" disabled={busyAction !== null} aria-busy={busyAction === 'sync'} onClick={() => void handleSync()}>
                {busyAction === 'sync' ? 'Sincronizando...' : 'Sincronizar agora'}
              </button>
              {!confirmDisconnect ? (
                <button type="button" className="button-secondary" disabled={busyAction !== null} onClick={() => setConfirmDisconnect(true)}>
                  Desconectar
                </button>
              ) : (
                <div className="task-disconnect-confirm" role="group" aria-label="Confirmar desconexão da conta Microsoft">
                  <span>Remover a conexão e os tokens salvos?</span>
                  <button type="button" className="button-secondary" disabled={busyAction !== null} onClick={() => setConfirmDisconnect(false)}>Cancelar</button>
                  <button type="button" disabled={busyAction !== null} aria-busy={busyAction === 'disconnect'} onClick={() => void handleDisconnect()}>
                    {busyAction === 'disconnect' ? 'Desconectando...' : 'Confirmar'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {status?.connected ? (
        <div className="task-center-setup-grid">
          <Card title="Preparar Planner + To Do" subtitle="Cria somente o que ainda não existe" className="task-setup-card">
            <div className="task-readiness-grid">
              <div>
                <span>Lista pessoal</span>
                <strong>{status.connection?.todoListId ? 'Central de Execução pronta' : 'Criação pendente'}</strong>
              </div>
              <div>
                <span>Plano compartilhado</span>
                <strong>{status.connection?.plannerPlanId ? 'Planner pronto' : 'Grupo necessário'}</strong>
              </div>
            </div>
            <label className="task-field">
              <span>Microsoft 365 Group ID para o Planner</span>
              <input
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                placeholder="Cole o ID do grupo/equipe que será dono do plano"
                autoComplete="off"
              />
              <small>A lista pessoal é criada no To Do. O plano compartilhado pertence ao grupo informado.</small>
            </label>
            <div className="actions">
              <button type="button" disabled={busyAction !== null} aria-busy={busyAction === 'bootstrap'} onClick={() => void handleBootstrap()}>
                {busyAction === 'bootstrap' ? 'Validando estrutura...' : status.connection?.todoListId && status.connection?.plannerPlanId ? 'Revalidar estrutura' : 'Preparar estrutura automaticamente'}
              </button>
            </div>
          </Card>

          <Card title="Criar tarefa rápida" subtitle="Escolha a fonte oficial correta" className="task-create-card">
            <form className="task-create-form" onSubmit={handleCreateTask}>
              <div className="task-form-row">
                <label className="task-field">
                  <span>Destino</span>
                  <select value={target} onChange={(event) => setTarget(event.target.value === 'planner' ? 'planner' : 'todo')}>
                    <option value="todo">Microsoft To Do — pessoal</option>
                    <option value="planner" disabled={!workspace?.planner.enabled}>Microsoft Planner — compartilhado</option>
                  </select>
                </label>
                {target === 'planner' ? (
                  <label className="task-field">
                    <span>Bucket</span>
                    <select value={bucket} onChange={(event) => setBucket(event.target.value)}>
                      {bucketOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="task-field">
                    <span>Prioridade</span>
                    <select value={importance} onChange={(event) => setImportance(event.target.value === 'high' ? 'high' : 'normal')}>
                      <option value="normal">Normal</option>
                      <option value="high">Alta</option>
                    </select>
                  </label>
                )}
              </div>
              <label className="task-field">
                <span>Título</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Revisar proposta da operação" required maxLength={160} />
              </label>
              <label className="task-field">
                <span>Descrição</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contexto, entregável e próximo passo" rows={3} maxLength={2_000} />
              </label>
              <label className="task-field">
                <span>Prazo</span>
                <input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
              {!workspace?.planner.enabled ? <small className="task-form-helper">O Planner será liberado após informar o Group ID e preparar a estrutura.</small> : null}
              <div className="actions">
                <button type="submit" disabled={busyAction !== null || !title.trim()} aria-busy={busyAction === 'create-task'}>
                  {busyAction === 'create-task' ? 'Criando...' : `Criar no ${target === 'todo' ? 'To Do' : 'Planner'}`}
                </button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      {workspace ? (
        <Card
          title="Fila de execução"
          subtitle={`${taskMetrics.total} tarefa(s) sincronizada(s) entre To Do e Planner`}
          className="task-board-card"
          actions={(
            <div className="task-filter-buttons" role="group" aria-label="Filtrar tarefas">
              {([
                ['open', 'Em aberto'],
                ['overdue', 'Atrasadas'],
                ['completed', 'Concluídas'],
                ['all', 'Todas'],
              ] as Array<[TaskFilter, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={taskFilter === value ? 'active' : ''}
                  aria-pressed={taskFilter === value}
                  onClick={() => setTaskFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        >
          <div className="task-board">
            <section className="task-column" aria-labelledby="todo-column-title">
              <header>
                <div>
                  <span className="task-source-mark task-source-todo" aria-hidden="true">T</span>
                  <div>
                    <strong id="todo-column-title">Microsoft To Do</strong>
                    <small>Execução pessoal</small>
                  </div>
                </div>
                <Pill tone="info">{visibleTodoTasks.length}</Pill>
              </header>
              {visibleTodoTasks.length ? (
                <ul className="task-list">
                  {visibleTodoTasks.map((task) => {
                    const completed = todoCompleted(task);
                    const overdue = isOverdue(task.dueDateTime?.dateTime, completed);
                    return (
                      <li key={task.id} className={`task-item ${completed ? 'task-item-complete' : ''} ${overdue ? 'task-item-overdue' : ''}`}>
                        <div className="task-item-heading">
                          <strong>{task.title}</strong>
                          <Pill tone={completed ? 'success' : overdue ? 'danger' : task.importance === 'high' ? 'warning' : 'default'}>
                            {completed ? 'concluída' : overdue ? 'atrasada' : task.importance === 'high' ? 'alta' : 'pendente'}
                          </Pill>
                        </div>
                        {task.body?.content ? <p>{task.body.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)}</p> : null}
                        <div className="task-item-meta"><span>Prazo</span><strong>{formatDate(task.dueDateTime?.dateTime)}</strong></div>
                      </li>
                    );
                  })}
                </ul>
              ) : <EmptyState title="Nenhuma tarefa neste filtro" description="Altere o filtro ou crie uma nova tarefa pessoal no formulário acima." />}
            </section>

            <section className="task-column" aria-labelledby="planner-column-title">
              <header>
                <div>
                  <span className="task-source-mark task-source-planner" aria-hidden="true">P</span>
                  <div>
                    <strong id="planner-column-title">Microsoft Planner</strong>
                    <small>Execução compartilhada</small>
                  </div>
                </div>
                <Pill tone={workspace.planner.enabled ? 'warning' : 'default'}>{workspace.planner.enabled ? visiblePlannerTasks.length : 'off'}</Pill>
              </header>
              {!workspace.planner.enabled ? (
                <EmptyState title="Planner ainda não configurado" description={workspace.planner.reason || 'Informe um Microsoft 365 Group ID e prepare a estrutura.'} />
              ) : visiblePlannerTasks.length ? (
                <ul className="task-list">
                  {visiblePlannerTasks.map((task) => {
                    const completed = plannerCompleted(task);
                    const overdue = isOverdue(task.dueDateTime, completed);
                    const progress = Math.max(0, Math.min(100, Number(task.percentComplete ?? 0)));
                    return (
                      <li key={task.id} className={`task-item ${completed ? 'task-item-complete' : ''} ${overdue ? 'task-item-overdue' : ''}`}>
                        <div className="task-item-heading">
                          <strong>{task.title}</strong>
                          <Pill tone={completed ? 'success' : overdue ? 'danger' : 'warning'}>{completed ? 'concluída' : overdue ? 'atrasada' : `${progress}%`}</Pill>
                        </div>
                        <div className="task-item-progress">
                          <ProgressBar value={progress} tone={completed ? 'success' : overdue ? 'warning' : 'info'} label={`Progresso de ${task.title}`} />
                        </div>
                        <div className="task-item-meta"><span>Bucket</span><strong>{plannerBuckets.get(task.bucketId || '') || 'Sem bucket'}</strong></div>
                        <div className="task-item-meta"><span>Prazo</span><strong>{formatDate(task.dueDateTime)}</strong></div>
                      </li>
                    );
                  })}
                </ul>
              ) : <EmptyState title="Nenhuma tarefa neste filtro" description="Altere o filtro ou crie uma nova tarefa compartilhada no formulário acima." />}
            </section>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
