import { useEffect, useState } from 'react';

export type AnchorTabItem = { readonly id: string; readonly title: string };

/**
 * Barra sticky de navegação por âncora para páginas longas (ex.: memo de crédito).
 * Faz scroll suave até o bloco e destaca o bloco visível durante o scroll.
 */
export function AnchorTabs({ items }: { items: readonly AnchorTabItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-64px 0px -70% 0px' },
    );
    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  const scrollTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="anchor-tabs" aria-label="Seções do memo">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`anchor-tab ${active === item.id ? 'active' : ''}`.trim()}
          onClick={() => scrollTo(item.id)}
        >
          {item.title}
        </button>
      ))}
    </nav>
  );
}
