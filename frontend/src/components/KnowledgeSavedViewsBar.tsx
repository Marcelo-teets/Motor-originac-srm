import { useMemo, useState } from 'react';
import { KnowledgeOutcomeIntelligencePanel } from './KnowledgeOutcomeIntelligencePanel';
import { Pill } from './UI';
import type {
  KnowledgeSavedView,
  KnowledgeSavedViewType,
  KnowledgeSortOrder,
  KnowledgeViewFilters,
  SaveKnowledgeViewInput,
} from '../lib/knowledgeVaultTypes';

export type KnowledgeViewState = {
  filters: KnowledgeViewFilters;
  sortOrder: KnowledgeSortOrder;
  viewType: KnowledgeSavedViewType;
};

type Props = {
  views: KnowledgeSavedView[];
  activeViewId: string | null;
  current: KnowledgeViewState;
  saving: boolean;
  onApply: (view: KnowledgeSavedView) => void;
  onClear: () => void;
  onSave: (input: SaveKnowledgeViewInput) => Promise<KnowledgeSavedView>;
  onDelete: (view: KnowledgeSavedView) => Promise<void>;
};

type Draft = {
  id: string | null;
  name: string;
  description: string;
  isShared: boolean;
};

const emptyDraft = (): Draft => ({ id: null, name: '', description: '', isShared: false });

export function KnowledgeSavedViewsBar({
  views,
  activeViewId,
  current,
  saving,
  onApply,
  onClear,
  onSave,
  onDelete,
}: Props) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [error, setError] = useState<string | null>(null);

  const activeView = useMemo(
    () => views.find((view) => view.id === activeViewId) ?? null,
    [activeViewId, views],
  );

  const beginCreate = () => {
    setDraft(emptyDraft());
    setError(null);
    setComposerOpen(true);
  };

  const beginEdit = () => {
    if (!activeView?.canEdit) return;
    setDraft({
      id: activeView.id,
      name: activeView.name,
      description: activeView.description,
      isShared: activeView.isShared,
    });
    setError(null);
    setComposerOpen(true);
  };

  const submit = async () => {
    if (!draft.name.trim()) {
      setError('Informe um nome para a Base.');
      return;
    }

    setError(null);
    try {
      await onSave({
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description.trim(),
        isShared: draft.isShared,
        viewType: current.viewType,
        filters: current.filters,
        sortConfig: { order: current.sortOrder },
        columns: ['title', 'node_type', 'company', 'tags', 'updated_at'],
      });
      setComposerOpen(false);
      setDraft(emptyDraft());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar a Base.');
    }
  };

  return (
    <>
      <section className="knowledge-bases" aria-label="Bases salvas do Knowledge Vault">
        <div className="knowledge-bases-head">
          <div>
            <span className="section-label">Bases</span>
            <strong>Visões operacionais reutilizáveis</strong>
            <small>Salve filtros, ordenação e modo de leitura para repetir a mesma análise.</small>
          </div>
          <div className="actions">
            {activeView?.canEdit ? (
              <button type="button" className="secondary compact-button" onClick={beginEdit}>Editar Base</button>
            ) : null}
            <button type="button" className="compact-button" onClick={beginCreate}>+ Salvar visão atual</button>
          </div>
        </div>

        <div className="knowledge-view-chips">
          <button
            type="button"
            className={`knowledge-view-chip ${activeViewId === null ? 'active' : ''}`}
            onClick={onClear}
          >
            <span>Visão livre</span>
            <small>Sem Base aplicada</small>
          </button>
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              className={`knowledge-view-chip ${activeViewId === view.id ? 'active' : ''}`}
              onClick={() => onApply(view)}
              title={view.description || `Aplicar ${view.name}`}
            >
              <span>{view.name}</span>
              <small>{view.viewType === 'graph' ? 'Grafo' : 'Lista'} · {view.isShared ? 'Equipe' : 'Privada'}</small>
            </button>
          ))}
        </div>

        {activeView ? (
          <div className="knowledge-active-view">
            <div>
              <Pill tone={activeView.isShared ? 'success' : 'info'}>{activeView.isShared ? 'compartilhada' : 'privada'}</Pill>
              <span>{activeView.description || 'Base aplicada ao workspace atual.'}</span>
            </div>
            {activeView.canEdit ? (
              <button
                type="button"
                className="secondary compact-button"
                disabled={saving}
                onClick={() => void onDelete(activeView)}
              >
                Excluir
              </button>
            ) : null}
          </div>
        ) : null}

        {composerOpen ? (
          <div className="knowledge-view-composer">
            <label>
              <span>Nome da Base</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, name: event.target.value }))}
                placeholder="Ex.: Teses FIDC prioritárias"
                autoFocus
              />
            </label>
            <label>
              <span>Descrição</span>
              <input
                value={draft.description}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, description: event.target.value }))}
                placeholder="Quando e por que usar esta visão"
              />
            </label>
            <label className="knowledge-view-share">
              <input
                type="checkbox"
                checked={draft.isShared}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, isShared: event.target.checked }))}
              />
              <span>Compartilhar com usuários autenticados da equipe</span>
            </label>
            <div className="actions">
              <button
                type="button"
                className="secondary compact-button"
                onClick={() => {
                  setComposerOpen(false);
                  setError(null);
                }}
              >
                Cancelar
              </button>
              <button type="button" className="compact-button" disabled={saving} onClick={() => void submit()}>
                {saving ? 'Salvando...' : draft.id ? 'Atualizar Base' : 'Criar Base'}
              </button>
            </div>
            {error ? <p className="knowledge-view-error">{error}</p> : null}
          </div>
        ) : null}
      </section>

      <KnowledgeOutcomeIntelligencePanel companyId={current.filters.companyId} />
    </>
  );
}
