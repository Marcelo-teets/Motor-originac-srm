import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Card, PageIntro, Pill } from '../components/UI';
import { useAuth } from '../lib/auth';
import {
  microsoftApi,
  type MicrosoftConnectionStatus,
  type MicrosoftWorkspace,
  type PlannerTask,
  type TodoTask,
} from '../lib/microsoftApi';

const formatDate = (value?: string | null) => {
  if (!value) return 'Sem prazo';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem prazo';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const todoCompleted = (task: TodoTask) => task.status === 'completed';
const plannerCompleted = (task: PlannerTask) => Number(task.percentComplete ?? 0) >= 100;

export function TaskCenterPage() {
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

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    const nextStatus = await microsoftApi.getStatus(session);
    setStatus(nextStatus);
    setGroupId(nextStatus.connection?.plannerGroupId ?? '');
    if (nextStatus.connected) {
      try {
        setWorkspace(await microsoftApi.getWorkspace(session));
      } catch (workspaceError) {
        setWorkspace(null);
        setError(workspaceError instanceof Error ? workspaceError.message : 'Falha ao carregar tarefas Microsoft.');
      }
    } else {
      setWorkspace(null);
    }
  }, [session]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a integração Microsoft.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const microsoftResult = query.get('microsoft');
    const oauthMessage = query.get('message');
    if (microsoftResult === 'connected') setMessage('Conta Microsoft conectada. Conclua a preparação do ambiente abaixo.');
    if (microsoftResult === 'error') setError(oauthMessage || 'A Microsoft recusou ou interrompeu a conexão.');
    if (microsoftResult) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const runAction = async (name: string, action: () => Promise<void>) => {
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
    setMessage('Estrutura preparada: lista do To Do, plano do Planner e buckets padrão verificados.');
    await load();
  });

  const handleSync = () => runAction('sync', async () => {
    const result = await microsoftApi.sync(session);
    setMessage(`Sincronização concluída: ${result.todoItemsRead} item(ns) do To Do e ${result.plannerItemsRead} do Planner.`);
    await load();
  });

  const handleDisconnect = () => runAction('disconnect', async () => {
    await microsoftApi.disconnect(session);
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

  if (loading) {
    return <div className="page"><Card title="Planner + To Do" subtitle="Carregando integração Microsoft">Validando conexão e estrutura de tarefas...</Card></div>;
  }

  return (
    <div className="page">
      <PageIntro
        eyebrow="Execução pessoal e compartilhada"
        title="Central de tarefas Microsoft"
        description="Use o To Do para suas tarefas pessoais e o Planner para projetos, responsáveis e trabalho em equipe, sem duplicar a fonte oficial."
        actions={<Pill tone={status?.connected ? 'success' : 'warning'}>{status?.connected ? 'Microsoft conectado' : 'Conexão pendente'}</Pill>}
      />

      {message ? <Card title="Resultado" subtitle="Última ação executada"><div className="table-helper">{message}</div></Card> : null}
      {error ? <Card title="Atenção" subtitle="A integração precisa de revisão"><div className="table-helper">{error}</div></Card> : null}

      <Card title="1. Conexão Microsoft" subtitle="OAuth seguro e permissões delegadas">
        <div className="stack-blocks">
          <div className="row-between">
            <div>
              <strong>{status?.connection?.displayName || 'Conta Microsoft'}</strong>
              <div className="table-helper">{status?.connection?.accountEmail || 'Nenhuma conta conectada'}</div>
            </div>
            <Pill tone={status?.connected ? 'success' : 'warning'}>{status?.connection?.status || 'desconectado'}</Pill>
          </div>
          {!status?.configured ? (
            <div className="table-helper">Variáveis pendentes na Vercel: {status?.missingConfig.join(', ') || 'configuração Microsoft não encontrada'}.</div>
          ) : null}
          {status?.connection?.lastSyncAt ? <div className="table-helper">Última sincronização: {formatDate(status.connection.lastSyncAt)}</div> : null}
          {status?.connection?.lastError ? <div className="table-helper">Último erro: {status.connection.lastError}</div> : null}
          <div className="actions">
            {!status?.connected ? (
              <button type="button" disabled={busyAction !== null || !status?.configured} onClick={() => void handleConnect()}>
                {busyAction === 'connect' ? 'Abrindo Microsoft...' : 'Conectar Microsoft'}
              </button>
            ) : (
              <>
                <button type="button" disabled={busyAction !== null} onClick={() => void handleSync()}>
                  {busyAction === 'sync' ? 'Sincronizando...' : 'Sincronizar agora'}
                </button>
                <button type="button" className="button-secondary" disabled={busyAction !== null} onClick={() => void handleDisconnect()}>
                  {busyAction === 'disconnect' ? 'Desconectando...' : 'Desconectar'}
                </button>
              </>
            )}
          </div>
        </div>
      </Card>

      {status?.connected ? (
        <Card title="2. Preparar Planner + To Do" subtitle="Cria somente o que ainda não existe">
          <div className="stack-blocks">
            <label>
              <span>Microsoft 365 Group ID para o Planner</span>
              <input
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                placeholder="Cole o ID do grupo/equipe que será dono do plano"
              />
            </label>
            <div className="table-helper">A lista pessoal “Central de Execução” é criada no To Do. O plano compartilhado usa o grupo Microsoft 365 informado.</div>
            <div className="actions">
              <button type="button" disabled={busyAction !== null} onClick={() => void handleBootstrap()}>
                {busyAction === 'bootstrap' ? 'Preparando...' : 'Preparar estrutura automaticamente'}
              </button>
            </div>
            <div className="table-helper">
              To Do: {status.connection?.todoListId ? 'pronto' : 'pendente'} · Planner: {status.connection?.plannerPlanId ? 'pronto' : 'pendente'}
            </div>
          </div>
        </Card>
      ) : null}

      {status?.connected ? (
        <Card title="3. Criar tarefa rápida" subtitle="Escolha o destino correto para evitar duplicidade">
          <form className="stack-blocks" onSubmit={handleCreateTask}>
            <div className="actions">
              <label>
                <span>Destino</span>
                <select value={target} onChange={(event) => setTarget(event.target.value === 'planner' ? 'planner' : 'todo')}>
                  <option value="todo">Microsoft To Do — pessoal</option>
                  <option value="planner">Microsoft Planner — compartilhado</option>
                </select>
              </label>
              {target === 'planner' ? (
                <label>
                  <span>Bucket</span>
                  <select value={bucket} onChange={(event) => setBucket(event.target.value)}>
                    {['Inbox', 'Esta semana', 'Em andamento', 'Aguardando', 'Concluído'].map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              ) : (
                <label>
                  <span>Prioridade</span>
                  <select value={importance} onChange={(event) => setImportance(event.target.value === 'high' ? 'high' : 'normal')}>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                  </select>
                </label>
              )}
            </div>
            <label>
              <span>Título</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Revisar proposta da operação" required />
            </label>
            <label>
              <span>Descrição</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contexto, entregável e próximo passo" rows={3} />
            </label>
            <label>
              <span>Prazo</span>
              <input type="datetime-local" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
            <div className="actions">
              <button type="submit" disabled={busyAction !== null || !title.trim()}>
                {busyAction === 'create-task' ? 'Criando...' : `Criar no ${target === 'todo' ? 'To Do' : 'Planner'}`}
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      {workspace ? (
        <>
          <Card title="Microsoft To Do" subtitle={`${workspace.todo.tasks.length} tarefa(s) na lista Central de Execução`}>
            {workspace.todo.tasks.length ? (
              <ul className="list">
                {workspace.todo.tasks
                  .slice()
                  .sort((left, right) => Number(todoCompleted(left)) - Number(todoCompleted(right)))
                  .map((task) => (
                    <li key={task.id}>
                      <strong>{task.title}</strong>
                      <span>{todoCompleted(task) ? 'Concluída' : 'Pendente'} · {formatDate(task.dueDateTime?.dateTime)}</span>
                    </li>
                  ))}
              </ul>
            ) : <div className="table-helper">Nenhuma tarefa na lista.</div>}
          </Card>

          <Card title="Microsoft Planner" subtitle={workspace.planner.enabled ? `${workspace.planner.tasks.length} tarefa(s) no plano Central de Execução` : 'Plano compartilhado ainda não configurado'}>
            {!workspace.planner.enabled ? (
              <div className="table-helper">{workspace.planner.reason || 'Informe um Microsoft 365 Group ID e prepare a estrutura.'}</div>
            ) : workspace.planner.tasks.length ? (
              <ul className="list">
                {workspace.planner.tasks
                  .slice()
                  .sort((left, right) => Number(plannerCompleted(left)) - Number(plannerCompleted(right)))
                  .map((task) => (
                    <li key={task.id}>
                      <strong>{task.title}</strong>
                      <span>
                        {plannerBuckets.get(task.bucketId || '') || 'Sem bucket'} · {plannerCompleted(task) ? 'Concluída' : `${Number(task.percentComplete ?? 0)}%`} · {formatDate(task.dueDateTime)}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : <div className="table-helper">Nenhuma tarefa no plano.</div>}
          </Card>
        </>
      ) : null}
    </div>
  );
}
