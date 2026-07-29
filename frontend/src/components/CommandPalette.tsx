import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { navItems } from '../config/nav';
import { useAuth } from '../lib/auth';

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

const workflowLabels: Record<string, string> = {
  '/search-profiles': 'Descobrir empresas',
  '/companies': 'Priorizar oportunidades',
  '/pipeline': 'Executar e acompanhar',
  '/task-center': 'Organizar tarefas',
  '/dcm-daily': 'Preparar abordagens',
  '/monitoring': 'Revisar novos sinais',
};

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { isGodMode } = useAuth();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const items = useMemo(() => navItems
    .filter((item) => !item.godOnly || isGodMode)
    .map((item) => ({
      ...item,
      workflowLabel: workflowLabels[item.to] ?? item.shortLabel,
      searchText: `${item.label} ${item.shortLabel} ${item.description} ${item.group}`.toLowerCase(),
    })), [isGodMode]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items.slice(0, 9);
    return items.filter((item) => item.searchText.includes(normalized)).slice(0, 12);
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setActiveIndex(0);
    document.body.classList.add('dialog-locked');
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.body.classList.remove('dialog-locked');
      previousFocusRef.current?.focus();
    };
  }, [open]);

  const openItem = (index: number) => {
    const item = filtered[index];
    if (!item) return;
    navigate(item.to);
    onClose();
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => filtered.length ? (current + 1) % filtered.length : 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => filtered.length ? (current - 1 + filtered.length) % filtered.length : 0);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
      return;
    }
    if (event.key === 'Enter' && event.target === inputRef.current && !event.nativeEvent.isComposing) {
      event.preventDefault();
      openItem(activeIndex);
      return;
    }
    if (event.key === 'Tab' && dialogRef.current) {
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  if (!open) return null;

  const activeId = filtered[activeIndex] ? `command-palette-item-${activeIndex}` : undefined;

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="command-palette-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar tela, fluxo ou ação..."
            aria-label="Buscar no Motor SRM"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
          />
          <button type="button" className="command-palette-close" onClick={onClose} aria-label="Fechar busca">ESC</button>
        </div>

        <div id="command-palette-results" className="command-palette-results" role="listbox">
          <div className="command-palette-heading" id="command-palette-title">
            <span>{query ? 'Resultados' : 'Ações rápidas'}</span>
            <small>Use ↑ ↓ e Enter</small>
          </div>
          {filtered.length ? filtered.map((item, index) => (
            <button
              id={`command-palette-item-${index}`}
              key={item.to}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              className={`command-palette-item ${activeIndex === index ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => openItem(index)}
            >
              <span className="command-palette-icon" aria-hidden="true">{item.label.slice(0, 1)}</span>
              <span>
                <strong>{item.workflowLabel}</strong>
                <small>{item.label} · {item.description}</small>
              </span>
              <span className="command-palette-group">{item.group}</span>
              <span aria-hidden="true">→</span>
            </button>
          )) : (
            <div className="command-palette-empty" role="status">
              <strong>Nenhuma tela encontrada</strong>
              <span>Tente buscar por “leads”, “pipeline”, “fontes” ou “monitoramento”.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
