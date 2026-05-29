import { Link } from 'react-router-dom';
import { Card, Pill, Stat } from './UI';

type VercelOpsPanelProps = {
  readonly source: string;
  readonly note: string;
  readonly activeSources: number;
  readonly outputs24h: number;
  readonly triggers24h: number;
};

function apiTone(source: string): 'success' | 'warning' | 'info' {
  if (source === 'supabase') return 'success';
  if (source === 'mock') return 'warning';
  return 'info';
}

export function VercelOpsPanel({ source, note, activeSources, outputs24h, triggers24h }: VercelOpsPanelProps) {
  const apiStatus = source === 'supabase' ? 'Supabase real' : source === 'mock' ? 'Fallback ativo' : source;

  return (
    <Card
      title="Vercel production readiness"
      subtitle="Checklist visual para operar o front-end em produção sem perder contexto de dados, API e originação"
      actions={<Pill tone={apiTone(source)}>{apiStatus}</Pill>}
      className="dense-card"
    >
      <div className="mini-metric-grid">
        <Stat label="API / Data source" value={apiStatus} helper={note} />
        <Stat label="Fontes ativas" value={String(activeSources)} helper="cobertura útil para sinais de originação" />
        <Stat label="Outputs 24h" value={String(outputs24h)} helper="capturas recentes consumidas pelo cockpit" />
        <Stat label="Triggers 24h" value={String(triggers24h)} helper="mudanças que podem alterar prioridade" />
      </div>

      <ul className="list compact-list top-gap">
        <li>
          <strong>Front-end Vite</strong>
          <span>SPA oficial no Vercel, orientada a dashboard, leads, company detail e pipeline.</span>
        </li>
        <li>
          <strong>Próxima validação operacional</strong>
          <span>Login, ranking, company detail, criação de activity/task e navegação sem localhost.</span>
        </li>
        <li>
          <strong>Critério de pronto para uso</strong>
          <span>Dados reais carregando, fallback explícito e próxima ação comercial visível.</span>
        </li>
      </ul>

      <div className="pill-row top-gap">
        <Link to="/monitoring" className="button secondary">Validar monitoring</Link>
        <Link to="/sources" className="button secondary">Ver fontes</Link>
        <Link to="/agents" className="button secondary">Checar agentes</Link>
      </div>
    </Card>
  );
}
