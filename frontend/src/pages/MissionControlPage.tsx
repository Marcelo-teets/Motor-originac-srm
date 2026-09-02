import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, PageIntro, Pill, ProgressBar, Stat } from '../components/UI';
import { missionControl, type MissionStatus } from '../config/missionControl';

type GithubItem = {
  number: number;
  title: string;
  html_url: string;
  pull_request?: unknown;
};

const tone = (status: MissionStatus): 'success' | 'warning' | 'info' | 'danger' => {
  if (status === 'real') return 'success';
  if (status === 'blocked') return 'danger';
  if (status === 'partial') return 'warning';
  return 'info';
};

const label = (status: MissionStatus) => ({
  real: 'Real', partial: 'Parcial', blocked: 'Bloqueado', planned: 'Planejado',
}[status]);

export function MissionControlPage() {
  const [githubItems, setGithubItems] = useState<GithubItem[]>([]);
  const [githubState, setGithubState] = useState<'loading' | 'live' | 'fallback'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api.github.com/repos/Marcelo-teets/Motor-originac-srm/issues?state=open&per_page=30&sort=updated', {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub ${response.status}`);
        return response.json() as Promise<GithubItem[]>;
      })
      .then((items) => {
        setGithubItems(items);
        setGithubState('live');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setGithubState('fallback');
      });
    return () => controller.abort();
  }, []);

  const stats = useMemo(() => {
    const modules = missionControl.modules;
    return {
      total: modules.length,
      real: modules.filter((item) => item[2] === 'real').length,
      partial: modules.filter((item) => item[2] === 'partial').length,
      blocked: modules.filter((item) => item[2] === 'blocked').length,
      avg: Math.round(modules.reduce((sum, item) => sum + item[4], 0) / modules.length),
    };
  }, []);

  const prs = githubItems.filter((item) => Boolean(item.pull_request)).slice(0, 6);
  const issues = githubItems.filter((item) => !item.pull_request).slice(0, 8);

  return (
    <div className="page mission-control-page">
      <PageIntro
        eyebrow={`Mission Control · ${missionControl.version}`}
        title="Centro de controle da missão"
        description="Visão única do produto, saúde dos módulos, prioridades de desenvolvimento, bloqueios e execução do Motor - Originação."
      />

      <section className="hero executive-hero">
        <div>
          <p className="eyebrow">Missão</p>
          <h2>{missionControl.mission}</h2>
          <div className="pill-row top-gap">
            {missionControl.currentFocus.map((item) => <Pill key={item} tone="info">{item}</Pill>)}
          </div>
        </div>
        <div className="executive-scores">
          <Stat label="Módulos" value={String(stats.total)} helper={`${stats.real} reais · ${stats.partial} parciais`} />
          <Stat label="Maturidade média" value={`${stats.avg}%`} helper="Manifesto versionado do projeto" />
          <Stat label="Bloqueios" value={String(stats.blocked)} helper="Gates que impedem avanço seguro" />
          <Stat label="GitHub" value={githubState === 'live' ? 'Ao vivo' : githubState === 'loading' ? 'Sincronizando' : 'Fallback'} helper="Issues e PRs abertas" />
        </div>
      </section>

      <div className="grid cols-2 detail-layout">
        <Card title="North Star" subtitle="Toda entrega precisa melhorar pelo menos uma destas respostas." tone="accent">
          <ol className="list compact-list">
            {missionControl.northStar.map((item) => <li key={item}><strong>{item}</strong></li>)}
          </ol>
        </Card>

        <Card title="Fila de desenvolvimento" subtitle="Ordem operacional: Agora → Próximo → Depois.">
          <div className="stack-blocks">
            {(['Agora', 'Próximo', 'Depois'] as const).map((lane) => (
              <div className="mini-panel" key={lane}>
                <div className="row-between"><strong>{lane}</strong><Pill>{missionControl.queue.filter((item) => item[4] === lane).length}</Pill></div>
                <ul className="list compact-list">
                  {missionControl.queue.filter((item) => item[4] === lane).map((item) => (
                    <li key={item[0]}>
                      <strong>{item[0]} · {item[1]}</strong>
                      <div className="pill-row"><Pill tone={item[2] === 'P0' ? 'danger' : 'info'}>{item[2]}</Pill><Pill tone={tone(item[3])}>{label(item[3])}</Pill></div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Mapa de maturidade do produto" subtitle="Feature por feature, com status, prioridade, progresso e atalho para a tela operacional.">
        <table className="dense-table">
          <thead><tr><th>Módulo</th><th>Camada</th><th>Status</th><th>Prioridade</th><th>Progresso</th><th>Tela</th></tr></thead>
          <tbody>
            {missionControl.modules.map((item) => (
              <tr key={item[0]}>
                <td><strong>{item[0]}</strong></td>
                <td>{item[1]}</td>
                <td><Pill tone={tone(item[2])}>{label(item[2])}</Pill></td>
                <td><Pill tone={item[3] === 'P0' ? 'danger' : item[3] === 'P1' ? 'warning' : 'info'}>{item[3]}</Pill></td>
                <td style={{ minWidth: 130 }}><ProgressBar value={item[4]} max={100} tone={item[4] >= 80 ? 'success' : item[4] >= 60 ? 'info' : 'warning'} /><small>{item[4]}%</small></td>
                <td>{item[5] ? <Link to={item[5]} className="button secondary compact-button">Abrir</Link> : <small>Runtime</small>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid cols-2 detail-layout">
        <Card title="Pull requests abertas" subtitle={githubState === 'live' ? 'Sincronizado diretamente do repositório oficial.' : 'A sincronização ao vivo está indisponível; o restante do Mission Control continua funcional.'}>
          {prs.length ? <ul className="list compact-list">{prs.map((item) => <li key={item.number}><a href={item.html_url} target="_blank" rel="noreferrer"><strong>PR #{item.number} · {item.title}</strong></a></li>)}</ul> : <p className="page-copy">Nenhuma PR carregada.</p>}
        </Card>
        <Card title="Issues abertas" subtitle="Pendências e gates registrados no GitHub.">
          {issues.length ? <ul className="list compact-list">{issues.map((item) => <li key={item.number}><a href={item.html_url} target="_blank" rel="noreferrer"><strong>#{item.number} · {item.title}</strong></a></li>)}</ul> : <p className="page-copy">Nenhuma issue carregada.</p>}
        </Card>
      </div>

      <Card title="Regra de uso" subtitle="Este painel é o cockpit; o GitHub continua sendo a fonte oficial do código.">
        <p className="page-copy">Atualize o manifesto quando a maturidade funcional mudar. Issues e PRs são carregadas ao vivo do repositório. Nenhum item deve ser considerado concluído apenas porque existe código: o status “Real” exige runtime, dado real e uso operacional compatível com a missão.</p>
      </Card>
    </div>
  );
}
