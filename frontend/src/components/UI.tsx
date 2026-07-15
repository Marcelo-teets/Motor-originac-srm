import type { CSSProperties, PropsWithChildren, ReactNode } from 'react';
import type { DataSourceKind } from '../lib/types';

export function Card({ children, title, subtitle, actions, tone = 'default', className = '' }: PropsWithChildren<{ title: string; subtitle?: string; actions?: ReactNode; tone?: 'default' | 'accent' | 'success'; className?: string }>) {
  return (
    <section className={`card ${tone !== 'default' ? `card-${tone}` : ''} ${className}`.trim()}>
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Pill({ children, tone = 'default' }: PropsWithChildren<{ tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' }>) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Stat({ label, value, helper, trend }: { label: string; value: string; helper?: string; trend?: string }) {
  return (
    <div className="stat-block">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
      {trend ? <em>{trend}</em> : null}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'default' }: { value: number; max?: number; tone?: 'default' | 'success' | 'warning' | 'info' }) {
  const safeMax = max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? value : 0;
  const width = `${Math.min(100, Math.max(0, Math.round((safeValue / safeMax) * 100)))}%`;
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={Math.min(safeMax, Math.max(0, safeValue))}>
      <i className={`bar-${tone}`} style={{ width } as CSSProperties} />
    </div>
  );
}

export function TableViewport({ children, minWidth, label = 'Tabela com rolagem horizontal' }: PropsWithChildren<{ minWidth?: number; label?: string }>) {
  return <div className="table-viewport" role="region" aria-label={label} tabIndex={0} style={minWidth ? { '--table-min-width': `${minWidth}px` } as CSSProperties : undefined}>{children}</div>;
}

export function KeyValueList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <ul className="list key-value-list">
      {items.map((item) => (
        <li key={item.label}>
          <strong>{item.label}</strong>
          <span>{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <section className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="page-copy">{description}</p>
      </div>
      {actions ? <div className="page-intro-actions">{actions}</div> : null}
    </section>
  );
}

export function DataStatusBanner({ source, note }: { source: DataSourceKind; note: string }) {
  const tone: Record<DataSourceKind, 'success' | 'warning' | 'info'> = { real: 'success', partial: 'warning', mock: 'info' };
  const label: Record<DataSourceKind, string> = { real: 'Backend real', partial: 'Parcial / derivado', mock: 'Fallback mock' };
  return (
    <div className={`data-banner data-banner-${source}`}>
      <Pill tone={tone[source]}>{label[source]}</Pill>
      <span>{note}</span>
    </div>
  );
}

export function LoadingState({ title, subtitle = 'Carregando dados operacionais do backend oficial.' }: { title: string; subtitle?: string }) {
  return (
    <div className="page">
      <Card title={title} subtitle={subtitle}>
        <div className="state-box state-loading">
          <span className="loading-dot" aria-hidden="true" />
          <div>
            <strong>Montando visão de originação...</strong>
            <p>Estamos buscando dados, scores, sinais e pipeline. A tela será liberada assim que a leitura terminar.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function ErrorState({ title, error, action }: { title: string; error?: string | null; action?: ReactNode }) {
  const message = error || 'Não foi possível carregar esta visão agora.';
  return (
    <div className="page">
      <Card title={title} subtitle="Falha controlada de carregamento" actions={action}>
        <div className="state-box state-error">
          <Pill tone="danger">atenção</Pill>
          <div>
            <strong>{message}</strong>
            <p>Verifique autenticação, disponibilidade do backend e variáveis de produção. A tela não deve quebrar silenciosamente.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="summary-item empty-state">
      <div className="stack-blocks compact-gap">
        <Pill tone="warning">sem dados</Pill>
        <strong>{title}</strong>
        <span>{description}</span>
        {action ? <div>{action}</div> : null}
      </div>
    </div>
  );
}

export function ScoreBadge({ value, kind }: { value: number | string; kind: 'qualification' | 'lead' | 'priority' | 'confidence' }) {
  const tone = kind === 'lead' ? 'success' : kind === 'priority' ? 'warning' : kind === 'confidence' ? 'info' : 'default';
  return <span className={`score-badge score-${tone}`}>{value}</span>;
}

export function SectionLabel({ children }: PropsWithChildren) {
  return <p className="section-label">{children}</p>;
}
