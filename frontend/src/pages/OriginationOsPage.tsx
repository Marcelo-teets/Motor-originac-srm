import { useEffect, useMemo, useState } from 'react';
import { Card, DataStatusBanner, PageIntro, Pill, ProgressBar, SectionLabel, Stat } from '../components/UI';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { DataState, OriginationOperatingSystem } from '../lib/types';

const statusTone = (status: string): 'success' | 'warning' | 'info' => {
  if (status === 'implemented') return 'success';
  if (status === 'runtime_ready') return 'warning';
  return 'info';
};

const statusLabel = (status: string) => {
  if (status === 'implemented') return 'Implementado';
  if (status === 'runtime_ready') return 'Runtime ready';
  return 'Documentado';
};

export function OriginationOsPage() {
  const { session } = useAuth();
  const [state, setState] = useState<DataState<OriginationOperatingSystem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    api.getOriginationOperatingSystem(session)
      .then((payload) => {
        if (!cancelled) {
          setState(payload);
          setActiveSkillId(payload.data.skills[0]?.id ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    return () => { cancelled = true; };
  }, [session]);

  const os = state?.data ?? null;
  const activeSkill = useMemo(
    () => os?.skills.find((skill) => skill.id === activeSkillId) ?? os?.skills[0] ?? null,
    [activeSkillId, os]
  );
  const implementedBacklog = os?.backlog.filter((item) => item.status === 'implemented').length ?? 0;
  const runtimeBacklog = os?.backlog.filter((item) => item.status === 'runtime_ready').length ?? 0;
  const documentedBacklog = os?.backlog.filter((item) => item.status === 'documented').length ?? 0;
  const totalBacklog = os?.backlog.length ?? 0;
  const implementationRate = totalBacklog ? Math.round((implementedBacklog / totalBacklog) * 100) : 0;

  if (error) {
    return (
      <div className="page">
        <PageIntro
          eyebrow="Origination OS"
          title="Sistema operacional de originação"
          description="Não foi possível carregar o framework versionado do backend."
        />
        <Card title="Erro de carregamento" subtitle={error}>
          <p className="page-copy">Revise o endpoint /api/origination/os e a configuração de runtime do Vercel.</p>
        </Card>
      </div>
    );
  }

  if (!state || !os) {
    return (
      <div className="page">
        <PageIntro
          eyebrow="Origination OS"
          title="Sistema operacional de originação"
          description="Carregando skills, scorecard, produtos, backlog e checklist operacional."
        />
      </div>
    );
  }

  return (
    <div className="page origination-os-page">
      <PageIntro
        eyebrow={`Origination OS · v${os.version}`}
        title="Sistema operacional de originação"
        description="Framework versionado que transforma pesquisa, ICP, hooks, scorecard, templates e rotinas comerciais em um cockpit operacional para FIDC/DCM."
      />

      <DataStatusBanner source={state.source} note={state.note} />

      <section className="hero executive-hero">
        <div>
          <p className="eyebrow">Tese central</p>
          <h2>Da inteligência pública para conversas qualificadas</h2>
          <p className="hero-copy">{os.thesis}</p>
          <div className="pill-row top-gap">
            {os.initialVerticals.slice(0, 6).map((vertical) => <Pill key={vertical} tone="info">{vertical}</Pill>)}
          </div>
        </div>
        <div className="executive-scores">
          <Stat label="Produtos DCM" value={String(os.products.length)} helper="FIDC, CRI, CRA, debêntures e incentivadas" />
          <Stat label="Skills" value={String(os.skills.length)} helper="Árvore operacional de execução" />
          <Stat label="Backlog implementado" value={`${implementationRate}%`} helper={`${implementedBacklog}/${totalBacklog} itens`} />
          <Stat label="Runtime ready" value={String(runtimeBacklog)} helper={`${documentedBacklog} itens ainda documentados`} />
        </div>
      </section>

      <div className="grid cols-2 detail-layout">
        <Card title="Produtos e hooks de originação" subtitle="Quando usar cada produto SRM/DCM." tone="accent">
          <div className="stack-blocks">
            {os.products.map((product) => (
              <div className="pattern-card" key={product.product}>
                <div className="row-between">
                  <strong>{product.product}</strong>
                  <Pill tone="success">{product.qualificationSignals.length} sinais</Pill>
                </div>
                <p>{product.useCase}</p>
                <SectionLabel>ICP</SectionLabel>
                <div className="pill-row">
                  {product.idealCompanyProfile.slice(0, 4).map((profile) => <Pill key={profile}>{profile}</Pill>)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Lead Scorecard DCM" subtitle="Critérios de priorização 0-100 para transformar sinal em ranking.">
          <div className="bars">
            {os.scorecard.map((criterion) => (
              <div key={criterion.criterion}>
                <div className="row-between">
                  <strong>{criterion.criterion}</strong>
                  <Pill tone="info">{criterion.weight} pts</Pill>
                </div>
                <ProgressBar value={criterion.weight} max={20} tone={criterion.weight >= 20 ? 'success' : criterion.weight >= 10 ? 'info' : 'warning'} />
                <small className="table-helper">Evidências: {criterion.evidence.join(', ')}</small>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid cols-2 detail-layout">
        <Card title="Origination Skill Tree" subtitle="Escolha uma skill para ver inputs, outputs e tarefas de execução." tone="accent">
          <div className="os-skill-layout">
            <div className="os-skill-nav">
              {os.skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  className={skill.id === activeSkill?.id ? 'secondary compact-button os-skill-active' : 'secondary compact-button'}
                  onClick={() => setActiveSkillId(skill.id)}
                >
                  {skill.name}
                </button>
              ))}
            </div>
            {activeSkill ? (
              <div className="mini-panel">
                <p className="eyebrow">{activeSkill.name}</p>
                <strong>{activeSkill.objective}</strong>
                <div className="split-stack top-gap">
                  <div>
                    <SectionLabel>Inputs</SectionLabel>
                    <ul className="list compact-list">
                      {activeSkill.inputs.slice(0, 6).map((input) => <li key={input}><strong>{input}</strong></li>)}
                    </ul>
                  </div>
                  <div>
                    <SectionLabel>Outputs</SectionLabel>
                    <ul className="list compact-list">
                      {activeSkill.outputs.slice(0, 6).map((output) => <li key={output}><strong>{output}</strong></li>)}
                    </ul>
                  </div>
                </div>
                <SectionLabel>Tarefas</SectionLabel>
                <div className="pill-row">
                  {activeSkill.tasks.map((task) => <Pill key={task} tone="info">{task}</Pill>)}
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Fluxos operacionais" subtitle="Do lead generation até pipeline comercial e pós-reunião.">
          <div className="stack-blocks">
            {os.flows.map((flow) => (
              <div className="mini-panel" key={flow.id}>
                <strong>{flow.name}</strong>
                <small className="table-helper">{flow.steps.join(' → ')}</small>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid cols-2 detail-layout">
        <Card title="Backlog ORIG" subtitle="Governança de produto: implementado, runtime ready ou documentado.">
          <table className="dense-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Status</th>
                <th>Implementação</th>
              </tr>
            </thead>
            <tbody>
              {os.backlog.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td><strong>{item.title}</strong><br /><small>{item.priority}</small></td>
                  <td><Pill tone={statusTone(item.status)}>{statusLabel(item.status)}</Pill></td>
                  <td>{item.implementation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="grid compact-gap">
          <Card title="Checklist por lead" subtitle="Mínimo necessário antes de abordagem executiva." tone="success">
            <ul className="list compact-list">
              {os.checklist.map((item) => <li key={item}><strong>{item}</strong></li>)}
            </ul>
          </Card>
          <Card title="Comandos padrão" subtitle="Prompts operacionais para pesquisa, abordagem e materiais.">
            <div className="stack-blocks">
              {os.commands.map((command) => (
                <div className="mini-panel" key={command.command}>
                  <strong>{command.command}</strong>
                  <small className="table-helper">Output: {command.output.join(', ')}</small>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
