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
  '/dcm-daily': 'Preparar abordagens',
  '/monitoring': 'Revisar novos sinais',
};

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { isGodMode } = useAuth();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!open) return;
    setQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Enter' && filtered[0]) {
        navigate(filtered[0].to);
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filtered, navigate, onClose, open]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Busca global do Motor SRM"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar tela, fluxo ou ação..."
            aria-label="Buscar no Motor SRM"
          />
          <kbd>ESC</kbd>
        </div>

        <div className="command-palette-results">
          <div className="command-palette-heading">
            <span>{query ? 'Resultados' : 'Ações rápidas'}</span>
            <small>Enter abre o primeiro resultado</small>
          </div>
          {filtered.length ? filtered.map((item) => (
            <button
              key={item.to}
              type="button"
              className="command-palette-item"
              onClick={() => {
                navigate(item.to);
                onClose();
              }}
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
            <div className="command-palette-empty">
              <strong>Nenhuma tela encontrada</strong>
              <span>Tente buscar por “leads”, “pipeline”, “fontes” ou “monitoramento”.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
