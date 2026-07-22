import { useEffect, useMemo, useState } from 'react';
import { EmptyState, PageIntro, Pill } from '../components/UI';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { knowledgeVaultApi } from '../lib/knowledgeVaultApi';
import type {
  KnowledgeGraphSnapshot,
  KnowledgeNodeDetail,
  KnowledgeNodeSummary,
  KnowledgeNodeType,
  KnowledgeVisibility,
  SaveKnowledgeNodeInput,
} from '../lib/knowledgeVaultTypes';
import type { CompanyListItem } from '../lib/types';
import '../styles/knowledge-vault.css';

const NODE_TYPES: Array<{ value: KnowledgeNodeType; label: string }> = [
  { value: 'note', label: 'Nota' },
  { value: 'company', label: 'Empresa' },
  { value: 'thesis', label: 'Tese de crédito' },
  { value: 'signal', label: 'Sinal' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'source', label: 'Fonte' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'structure', label: 'Estrutura' },
];

const TYPE_LABEL = Object.fromEntries(NODE_TYPES.map((item) => [item.value, item.label])) as Record<KnowledgeNodeType, string>;

const EMPTY_GRAPH: KnowledgeGraphSnapshot = { nodes: [], companyNodes: [], edges: [], companyEdges: [] };

const emptyDraft = (nodeType: KnowledgeNodeType = 'note'): SaveKnowledgeNodeInput => ({
  id: null,
  title: '',
  nodeType,
  contentMarkdown: '',
  tags: [],
  properties: {},
  companyId: null,
  visibility: 'team',
});

const detailToDraft = (detail: KnowledgeNodeDetail): SaveKnowledgeNodeInput => ({
  id: detail.node.id,
  title: detail.node.title,
  nodeType: detail.node.nodeType,
  contentMarkdown: detail.node.contentMarkdown,
  tags: detail.node.tags,
  properties: detail.node.properties,
  companyId: detail.node.companyId,
  visibility: detail.node.visibility,
});

const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date(value));

const normalizeTitle = (value: string) => value.trim().toLocaleLowerCase('pt-BR');

function WikiText({ text, nodes, onOpen }: { text: string; nodes: KnowledgeNodeSummary[]; onOpen: (nodeId: string) => void }) {
  const parts = text.split(/(\[\[[^\]]+\]\])/g).filter(Boolean);

  return (
    <>
      {parts.map((part, index) => {
        if (!part.startsWith('[[') || !part.endsWith(']]')) return <span key={`${part}-${index}`}>{part}</span>;
        const raw = part.slice(2, -2);
        const [target, alias] = raw.split('|').map((value) => value.trim());
        const resolved = nodes.find((node) => normalizeTitle(node.title) === normalizeTitle(target));
        return (
          <button
            key={`${part}-${index}`}
            type="button"
            className={`knowledge-wikilink ${resolved ? 'resolved' : 'unresolved'}`}
            onClick={() => resolved && onOpen(resolved.id)}
            title={resolved ? `Abrir ${resolved.title}` : `Link ainda não resolvido: ${target}`}
          >
            {alias || target}
          </button>
        );
      })}
    </>
  );
}

function MarkdownPreview({ content, nodes, onOpen }: { content: string; nodes: KnowledgeNodeSummary[]; onOpen: (nodeId: string) => void }) {
  const lines = content.split('\n');
  if (!content.trim()) return <p className="knowledge-preview-empty">Escreva em Markdown. Use [[Nome da nota]] para criar relações e backlinks.</p>;

  return (
    <div className="knowledge-preview-body">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="knowledge-preview-space" />;
        if (trimmed.startsWith('### ')) return <h4 key={index}><WikiText text={trimmed.slice(4)} nodes={nodes} onOpen={onOpen} /></h4>;
        if (trimmed.startsWith('## ')) return <h3 key={index}><WikiText text={trimmed.slice(3)} nodes={nodes} onOpen={onOpen} /></h3>;
        if (trimmed.startsWith('# ')) return <h2 key={index}><WikiText text={trimmed.slice(2)} nodes={nodes} onOpen={onOpen} /></h2>;
        if (/^[-*] /.test(trimmed)) return <div key={index} className="knowledge-preview-list"><span>•</span><p><WikiText text={trimmed.slice(2)} nodes={nodes} onOpen={onOpen} /></p></div>;
        if (/^\d+\. /.test(trimmed)) return <div key={index} className="knowledge-preview-list"><span>{trimmed.match(/^\d+/)?.[0]}.</span><p><WikiText text={trimmed.replace(/^\d+\. /, '')} nodes={nodes} onOpen={onOpen} /></p></div>;
        if (trimmed.startsWith('> ')) return <blockquote key={index}><WikiText text={trimmed.slice(2)} nodes={nodes} onOpen={onOpen} /></blockquote>;
        return <p key={index}><WikiText text={line} nodes={nodes} onOpen={onOpen} /></p>;
      })}
    </div>
  );
}

function KnowledgeGraph({ graph, selectedId, onOpen }: { graph: KnowledgeGraphSnapshot; selectedId?: string | null; onOpen: (nodeId: string) => void }) {
  const allNodes = [
    ...graph.nodes.map((node) => ({ id: node.id, title: node.title, kind: node.nodeType, selectable: true })),
    ...graph.companyNodes.map((company) => ({ id: `company:${company.id}`, title: company.name, kind: 'linked-company', selectable: false })),
  ];

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    if (!allNodes.length) return map;
    const centerX = 380;
    const centerY = 220;
    const maxRadius = Math.min(170, 72 + allNodes.length * 4);
    allNodes.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / allNodes.length - Math.PI / 2;
      const ring = index % 3 === 0 ? maxRadius * 0.58 : maxRadius;
      map.set(node.id, { x: centerX + Math.cos(angle) * ring, y: centerY + Math.sin(angle) * ring });
    });
    return map;
  }, [allNodes]);

  const edges = [...graph.edges, ...graph.companyEdges].filter((edge) => edge.target && positions.has(edge.source) && positions.has(edge.target));

  if (!allNodes.length) {
    return <div className="knowledge-graph-empty">O grafo aparece assim que a primeira nota é criada.</div>;
  }

  return (
    <svg className="knowledge-graph" viewBox="0 0 760 440" role="img" aria-label="Grafo de conhecimento da originação">
      <g className="knowledge-graph-edges">
        {edges.map((edge) => {
          const source = positions.get(edge.source)!;
          const target = positions.get(edge.target!)!;
          return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={`edge-${edge.relationType}`} />;
        })}
      </g>
      <g className="knowledge-graph-nodes">
        {allNodes.map((node) => {
          const position = positions.get(node.id)!;
          const selected = node.id === selectedId;
          return (
            <g
              key={node.id}
              className={`knowledge-graph-node node-${node.kind} ${selected ? 'selected' : ''} ${node.selectable ? 'selectable' : ''}`}
              transform={`translate(${position.x} ${position.y})`}
              onClick={() => node.selectable && onOpen(node.id)}
            >
              <circle r={selected ? 13 : 10} />
              <text y="25" textAnchor="middle">{node.title.length > 22 ? `${node.title.slice(0, 20)}…` : node.title}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function KnowledgeVaultPage() {
  const { session } = useAuth();
  const [nodes, setNodes] = useState<KnowledgeNodeSummary[]>([]);
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [graph, setGraph] = useState<KnowledgeGraphSnapshot>(EMPTY_GRAPH);
  const [detail, setDetail] = useState<KnowledgeNodeDetail | null>(null);
  const [draft, setDraft] = useState<SaveKnowledgeNodeInput>(() => emptyDraft());
  const [query, setQuery] = useState('');
  const [nodeTypeFilter, setNodeTypeFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [tagText, setTagText] = useState('');
  const [rightPanel, setRightPanel] = useState<'preview' | 'connections' | 'graph'>('connections');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedId = detail?.node.id ?? draft.id ?? null;

  const loadWorkspace = async (preferredNodeId?: string | null) => {
    setError(null);
    const [loadedNodes, loadedGraph, companyState] = await Promise.all([
      knowledgeVaultApi.listNodes(session, {
        query,
        nodeType: nodeTypeFilter,
        companyId: companyFilter,
      }),
      knowledgeVaultApi.getGraph(session, companyFilter || undefined),
      api.getCompanies(session),
    ]);
    setNodes(loadedNodes);
    setGraph(loadedGraph);
    setCompanies(companyState.data);

    const nodeToOpen = preferredNodeId ?? selectedId ?? loadedNodes[0]?.id;
    if (nodeToOpen && loadedNodes.some((node) => node.id === nodeToOpen)) {
      const loadedDetail = await knowledgeVaultApi.getNode(session, nodeToOpen);
      setDetail(loadedDetail);
      setDraft(detailToDraft(loadedDetail));
      setTagText(loadedDetail.node.tags.join(', '));
    } else if (!draft.id) {
      setDetail(null);
    }
  };

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void loadWorkspace()
        .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o Knowledge Vault.'))
        .finally(() => active && setLoading(false));
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
    // selectedId/draft are intentionally excluded: filters drive list reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, query, nodeTypeFilter, companyFilter]);

  const openNode = async (nodeId: string) => {
    setError(null);
    setNotice(null);
    try {
      const loadedDetail = await knowledgeVaultApi.getNode(session, nodeId);
      setDetail(loadedDetail);
      setDraft(detailToDraft(loadedDetail));
      setTagText(loadedDetail.node.tags.join(', '));
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Falha ao abrir a nota.');
    }
  };

  const startNew = (nodeType: KnowledgeNodeType = 'note') => {
    setDetail(null);
    setDraft(emptyDraft(nodeType));
    setTagText('');
    setNotice('Nova nota iniciada. Preencha o título e salve para persistir no Supabase.');
    setRightPanel('preview');
  };

  const saveNode = async () => {
    if (!draft.title.trim()) {
      setError('Informe um título antes de salvar.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await knowledgeVaultApi.saveNode(session, {
        ...draft,
        title: draft.title.trim(),
        tags: tagText.split(',').map((tag) => tag.trim().toLocaleLowerCase('pt-BR')).filter(Boolean),
      });
      setDetail(saved);
      setDraft(detailToDraft(saved));
      setTagText(saved.node.tags.join(', '));
      setNotice(`“${saved.node.title}” salva com backlinks e versão histórica atualizados.`);
      await loadWorkspace(saved.node.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar a nota.');
    } finally {
      setSaving(false);
    }
  };

  const archiveNode = async () => {
    if (!detail || !window.confirm(`Arquivar “${detail.node.title}”? O histórico será preservado.`)) return;
    setSaving(true);
    setError(null);
    try {
      await knowledgeVaultApi.archiveNode(session, detail.node.id);
      setDetail(null);
      setDraft(emptyDraft());
      setTagText('');
      setNotice('Nota arquivada. O registro permanece auditável no Supabase.');
      await loadWorkspace(null);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Falha ao arquivar a nota.');
    } finally {
      setSaving(false);
    }
  };

  const filteredCountLabel = nodes.length === 1 ? '1 nota' : `${nodes.length} notas`;
  const totalConnections = nodes.reduce((sum, node) => sum + node.outboundCount, 0);

  return (
    <div className="page knowledge-vault-page">
      <PageIntro
        eyebrow="Origination Knowledge Vault"
        title="Memória conectada da originação"
        description="Workspace interno inspirado no Obsidian: Markdown, WikiLinks, backlinks, grafo e propriedades estruturadas — conectado a empresas, teses, sinais, reuniões, fontes e estruturas de crédito."
        actions={(
          <div className="page-intro-actions">
            <Pill tone="success">Supabase real + RLS</Pill>
            <button type="button" onClick={() => startNew('note')}>+ Nova nota</button>
          </div>
        )}
      />

      <section className="knowledge-vault-stats">
        <div><span>Notas visíveis</span><strong>{nodes.length}</strong><small>Equipe + privadas do usuário</small></div>
        <div><span>Conexões</span><strong>{totalConnections}</strong><small>WikiLinks resolvidos ou pendentes</small></div>
        <div><span>Empresas conectadas</span><strong>{graph.companyNodes.length}</strong><small>Links com Company Master</small></div>
        <div><span>Versões da nota</span><strong>{detail?.versions.length ?? 0}</strong><small>Histórico auditável carregado</small></div>
      </section>

      {error ? <div className="data-banner data-banner-warning"><Pill tone="danger">erro</Pill><span>{error}</span></div> : null}
      {notice ? <div className="data-banner data-banner-success"><Pill tone="success">ok</Pill><span>{notice}</span></div> : null}

      <section className="knowledge-vault-toolbar">
        <label>
          <span>Busca global</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Empresa, tese, sinal, estrutura..." />
        </label>
        <label>
          <span>Tipo</span>
          <select value={nodeTypeFilter} onChange={(event) => setNodeTypeFilter(event.target.value)}>
            <option value="">Todos os tipos</option>
            {NODE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span>Empresa</span>
          <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
            <option value="">Todas as empresas</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        <div className="knowledge-toolbar-meta"><Pill tone="info">{filteredCountLabel}</Pill></div>
      </section>

      <section className="knowledge-vault-workspace">
        <aside className="knowledge-note-list" aria-label="Notas do Knowledge Vault">
          <div className="knowledge-pane-head">
            <div><span className="section-label">Vault</span><strong>Notas e entidades</strong></div>
            <button type="button" className="secondary compact-button" onClick={() => startNew('note')}>+</button>
          </div>
          <div className="knowledge-template-row">
            <button type="button" onClick={() => startNew('thesis')}>Tese</button>
            <button type="button" onClick={() => startNew('meeting')}>Reunião</button>
            <button type="button" onClick={() => startNew('playbook')}>Playbook</button>
          </div>
          <div className="knowledge-note-scroll">
            {loading ? <p className="knowledge-muted">Carregando notas...</p> : null}
            {!loading && !nodes.length ? (
              <EmptyState title="O Vault está vazio" description="Crie a primeira tese, reunião ou playbook. Os vínculos aparecem automaticamente quando você usar [[WikiLinks]]." />
            ) : null}
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`knowledge-note-item ${selectedId === node.id ? 'active' : ''}`}
                onClick={() => void openNode(node.id)}
              >
                <span className={`knowledge-node-icon type-${node.nodeType}`}>{node.nodeType.slice(0, 1).toUpperCase()}</span>
                <span className="knowledge-note-copy">
                  <strong>{node.title}</strong>
                  <small>{TYPE_LABEL[node.nodeType]}{node.companyName ? ` · ${node.companyName}` : ''}</small>
                  <small>{node.backlinkCount} backlinks · {formatDate(node.updatedAt)}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="knowledge-editor-pane">
          <div className="knowledge-editor-head">
            <div>
              <span className="section-label">Editor Markdown</span>
              <strong>{draft.id ? 'Editar conhecimento existente' : 'Criar novo conhecimento'}</strong>
            </div>
            <div className="actions">
              {detail ? <button type="button" className="secondary compact-button" onClick={() => void archiveNode()} disabled={saving}>Arquivar</button> : null}
              <button type="button" className="compact-button" onClick={() => void saveNode()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar nota'}</button>
            </div>
          </div>

          <div className="knowledge-editor-fields">
            <input
              className="knowledge-title-input"
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Título da nota"
              aria-label="Título da nota"
            />
            <div className="knowledge-property-grid">
              <label>
                <span>Tipo</span>
                <select value={draft.nodeType} onChange={(event) => setDraft((current) => ({ ...current, nodeType: event.target.value as KnowledgeNodeType }))}>
                  {NODE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>
                <span>Empresa vinculada</span>
                <select value={draft.companyId ?? ''} onChange={(event) => setDraft((current) => ({ ...current, companyId: event.target.value || null }))}>
                  <option value="">Sem vínculo direto</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label>
                <span>Visibilidade</span>
                <select value={draft.visibility} onChange={(event) => setDraft((current) => ({ ...current, visibility: event.target.value as KnowledgeVisibility }))}>
                  <option value="team">Equipe</option>
                  <option value="private">Privada</option>
                </select>
              </label>
              <label>
                <span>Tags</span>
                <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="fidc, funding-gap, reunião" />
              </label>
            </div>
            <textarea
              className="knowledge-markdown-editor"
              value={draft.contentMarkdown}
              onChange={(event) => setDraft((current) => ({ ...current, contentMarkdown: event.target.value }))}
              placeholder={'# Tese\n\nO que mudou?\n\n- Sinal observado\n- Impacto financeiro\n- Estrutura sugerida\n\nRelacionar com [[Nome da empresa]] ou [[Playbook FIDC]].'}
              spellCheck
            />
          </div>
        </main>

        <aside className="knowledge-context-pane">
          <div className="knowledge-context-tabs">
            <button type="button" className={rightPanel === 'preview' ? 'active' : ''} onClick={() => setRightPanel('preview')}>Preview</button>
            <button type="button" className={rightPanel === 'connections' ? 'active' : ''} onClick={() => setRightPanel('connections')}>Conexões</button>
            <button type="button" className={rightPanel === 'graph' ? 'active' : ''} onClick={() => setRightPanel('graph')}>Grafo</button>
          </div>

          {rightPanel === 'preview' ? (
            <div className="knowledge-context-content">
              <MarkdownPreview content={draft.contentMarkdown} nodes={nodes} onOpen={(nodeId) => void openNode(nodeId)} />
            </div>
          ) : null}

          {rightPanel === 'connections' ? (
            <div className="knowledge-context-content knowledge-connections">
              <section>
                <span className="section-label">Backlinks</span>
                {detail?.backlinks.length ? detail.backlinks.map((link) => (
                  <button key={link.id} type="button" className="knowledge-connection-item" onClick={() => void openNode(link.sourceNodeId)}>
                    <strong>{link.sourceTitle}</strong>
                    <small>{link.relationType}</small>
                  </button>
                )) : <p className="knowledge-muted">Nenhuma nota aponta para esta nota.</p>}
              </section>
              <section>
                <span className="section-label">Links desta nota</span>
                {detail?.outgoing.length ? detail.outgoing.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    className={`knowledge-connection-item ${link.targetNodeId ? '' : 'unresolved'}`}
                    onClick={() => link.targetNodeId && void openNode(link.targetNodeId)}
                  >
                    <strong>{link.resolvedTitle ?? link.targetTitle}</strong>
                    <small>{link.targetNodeId ? 'resolvido' : 'aguardando criação da nota'}</small>
                  </button>
                )) : <p className="knowledge-muted">Use [[Nome da nota]] no editor para criar relações.</p>}
              </section>
              <section>
                <span className="section-label">Histórico</span>
                {detail?.versions.length ? detail.versions.map((version) => (
                  <div key={version.id} className="knowledge-version-item">
                    <strong>v{version.versionNumber}</strong>
                    <span>{formatDate(version.createdAt)}</span>
                  </div>
                )) : <p className="knowledge-muted">A primeira versão nasce no primeiro salvamento.</p>}
              </section>
            </div>
          ) : null}

          {rightPanel === 'graph' ? (
            <div className="knowledge-context-content knowledge-graph-wrap">
              <KnowledgeGraph graph={graph} selectedId={selectedId} onOpen={(nodeId) => void openNode(nodeId)} />
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
}
