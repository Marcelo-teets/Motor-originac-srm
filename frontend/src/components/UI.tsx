import type { PropsWithChildren } from 'react';

export function Card({ children, title, subtitle }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function Pill({ children }: PropsWithChildren) {
  return <span className="pill">{children}</span>;
}
