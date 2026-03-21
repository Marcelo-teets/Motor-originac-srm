import type { CSSProperties, PropsWithChildren, ReactNode } from 'react';

export function Card({ children, title, subtitle, actions, tone = 'default' }: PropsWithChildren<{ title: string; subtitle?: string; actions?: ReactNode; tone?: 'default' | 'accent' | 'success' }>) {
  return (
    <section className={`card ${tone !== 'default' ? `card-${tone}` : ''}`}>
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

export function Stat({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="stat-block">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
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
