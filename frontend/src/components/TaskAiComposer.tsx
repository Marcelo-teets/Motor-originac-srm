import { useEffect, useState } from 'react';
import { Card, PageIntro, Pill } from './UI';
import { useAuth } from '../lib/auth';
import { microsoftApi } from '../lib/microsoftApi';
import {
  taskAiApi,
  type PlannedTask,
  type TaskAiPlan,
  type TaskAiProvider,
  type TaskAiStatus,
} from '../lib/taskAiApi';

const formatDueDate = (value: string | null) => {
  if (!value) return 'Sem prazo definido';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem prazo definido';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

const providerLabel = (provider: 'openai' | 'anthropic') => provider === 'openai' ? 'GPT' : 'Claude';

export function TaskAiComposer() {
  const { session } = useAuth();
  const [status, setStatus] = useState<TaskAiStatus | null>(null);
  const [provider, setProvider] = useState<TaskAiProvider>('auto');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<TaskAiPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [creatingAll, setCreatingAll] = useState(false);
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);
  const [createdIndexes, setCreatedIndexes] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void taskAiApi.getStatus(session)
      .then((nextStatus) => { if (active) setStatus(nextStatus); })
      .catch((statusError) => { if (active) setError(statusError instanceof Error ? statusError.message : 'Falha ao carregar os provedores de IA.'); });
    return () => { active = false; };
  }, [session]);

  const planTasks = async () => {
    if (!prompt.trim()) return;
    setPlanning(true);
    setError(null);
    setMessage(null);
    setCreatedIndexes([]);
    try {
      const nextResult = await taskAiApi.plan(session, prompt.trim(), provider);
      setResult(nextResult);
      setMessage(`${providerLabel(nextResult.provider)} organizou o pedido em ${nextResult.plan.tasks.length} tarefa(s). Revise antes de criar.`);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : 'A IA não conseguiu organizar as tarefas.');
    } finally {
      setPlanning(false);
    }
  };

  const createOne = async (task: PlannedTask, index: number) => {
    setCreatingIndex(index);
    setError(null);
    try {
      await microsoftApi.createTask(session, {
        target: task.target,
        title: task.title,
        description: task.description || undefined,
        dueDate: task.dueDate || undefined,
        importance: task.importance,
        bucket: task.target === 'planner' ? task.bucket : undefined,
      });
      setCreatedIndexes((current) => current.includes(index) ? current : [...current, index]);
      setMessage(`Tarefa “${task.title}” criada no ${task.target === 'todo' ? 'To Do' : 'Planner'}.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível criar a tarefa na Microsoft.');
      throw createError;
    } finally {
      setCreatingIndex(null);
    }
  };

  const createAll = async () => {
    if (!result) return;
    setCreatingAll(true);
    setError(null);
    let created = 0;
    try {
      for (let index = 0; index < result.plan.tasks.length; index += 1) {
        if (createdIndexes.includes(index)) continue;
        await createOne(result.plan.tasks[index], index);
        created += 1;
      }
      setMessage(`${created} nova(s) tarefa(s) criada(s) na Microsoft após sua aprovação.`);
    } catch {
      setMessage(created ? `${created} tarefa(s) foram criadas antes da interrupção.` : null);
    } finally {
      setCreatingAll(false);
    }
  };

  const configuredProviders = [
    status?.openai.configured ? 'GPT' : null,
    status?.anthropic.configured ? 'Claude' : null,
  ].filter(Boolean).join(' + ');

  return (
    <div className="page">
      <PageIntro
        eyebrow="GPT + Claude"
        title="Assistente de tarefas com IA"
        description="Descreva um objetivo em linguagem natural. A IA divide o trabalho, escolhe To Do ou Planner e apresenta tudo para sua aprovação antes de criar qualquer item."
        actions={<Pill tone={configuredProviders ? 'success' : 'warning'}>{configuredProviders || 'Chaves de IA pendentes'}</Pill>}
      />

      {message ? <Card title="Resultado" subtitle="Última ação"><div className="table-helper">{message}</div></Card> : null}
      {error ? <Card title="Atenção" subtitle="Não foi possível concluir a ação"><div className="table-helper">{error}</div></Card> : null}

      <Card title="1. Descrever o trabalho" subtitle="Pode ser uma tarefa simples, um projeto ou uma lista de pendências">
        <div className="stack-blocks">
          <label>
            <span>Modelo</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value as TaskAiProvider)}>
              <option value="auto">Automático — usa o provedor disponível</option>
              <option value="openai" disabled={!status?.openai.configured}>GPT {status?.openai.configured ? `— ${status.openai.model}` : '— não configurado'}</option>
              <option value="anthropic" disabled={!status?.anthropic.configured}>Claude {status?.anthropic.configured ? `— ${status.anthropic.model}` : '— não configurado'}</option>
            </select>
          </label>
          <label>
            <span>O que precisa ser feito?</span>
            <textarea
              rows={6}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ex.: Preciso preparar a reunião com o cliente na próxima quinta, revisar o material, levantar pendências, dividir as entregas com o time e lembrar de enviar o follow-up no dia seguinte."
            />
          </label>
          <div className="actions">
            <button type="button" disabled={planning || !prompt.trim() || !configuredProviders} onClick={() => void planTasks()}>
              {planning ? 'Organizando...' : 'Organizar tarefas com IA'}
            </button>
          </div>
          {!configuredProviders ? <div className="table-helper">Cadastre `OPENAI_API_KEY` e/ou `ANTHROPIC_API_KEY` na Vercel para ativar o assistente.</div> : null}
        </div>
      </Card>

      {result ? (
        <Card title="2. Revisar e aprovar" subtitle={`${providerLabel(result.provider)} · ${result.model} · nenhuma tarefa é criada automaticamente`}>
          <div className="stack-blocks">
            <div>{result.plan.summary}</div>
            <div className="actions">
              <button type="button" disabled={creatingAll || createdIndexes.length === result.plan.tasks.length} onClick={() => void createAll()}>
                {creatingAll ? 'Criando tarefas...' : 'Aprovar e criar todas'}
              </button>
            </div>
            <ul className="list">
              {result.plan.tasks.map((task, index) => {
                const created = createdIndexes.includes(index);
                return (
                  <li key={`${task.title}-${index}`}>
                    <div className="row-between">
                      <div>
                        <strong>{index + 1}. {task.title}</strong>
                        <span>{task.target === 'todo' ? 'To Do · pessoal' : `Planner · ${task.bucket}`} · {formatDueDate(task.dueDate)} · prioridade {task.importance === 'high' ? 'alta' : 'normal'}</span>
                      </div>
                      <Pill tone={created ? 'success' : task.target === 'planner' ? 'warning' : 'neutral'}>{created ? 'criada' : task.target}</Pill>
                    </div>
                    {task.description ? <div className="table-helper">{task.description}</div> : null}
                    <div className="table-helper">Por quê: {task.rationale}</div>
                    <div className="actions top-gap">
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={created || creatingAll || creatingIndex !== null}
                        onClick={() => void createOne(task, index)}
                      >
                        {creatingIndex === index ? 'Criando...' : created ? 'Criada' : `Criar no ${task.target === 'todo' ? 'To Do' : 'Planner'}`}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
