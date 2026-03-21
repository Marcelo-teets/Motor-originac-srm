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
  const width = `${Math.min(100, Math.round((value / max) * 100))}%`;
  return <div className="bar"><i className={`bar-${tone}`} style={{ width } as CSSProperties} /></div>;
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

export function ScoreBadge({ value, kind }: { value: number | string; kind: 'qualification' | 'lead' | 'priority' | 'confidence' }) {
  const tone = kind === 'lead' ? 'success' : kind === 'priority' ? 'warning' : kind === 'confidence' ? 'info' : 'default';
  return <span className={`score-badge score-${tone}`}>{value}</span>;
}

export function SectionLabel({ children }: PropsWithChildren) {
  return <p className="section-label">{children}</p>;
}
