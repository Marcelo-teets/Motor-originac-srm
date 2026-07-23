import type { SessionData } from './types';
import type {
  KnowledgeBacklink,
  KnowledgeCompanyWorkspace,
  KnowledgeGraphSnapshot,
  KnowledgeNode,
  KnowledgeNodeDetail,
  KnowledgeNodeSummary,
  KnowledgeOutgoingLink,
  KnowledgeReference,
  KnowledgeSavedView,
  KnowledgeVersion,
  KnowledgeVisibility,
  SaveKnowledgeNodeInput,
  SaveKnowledgeViewInput,
} from './knowledgeVaultTypes';

const env = import.meta.env;
const supabaseUrl = String(env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = String(env.VITE_SUPABASE_ANON_KEY ?? '');

type RpcError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

type NodeRow = {
  id: string;
  title: string;
  slug: string;
  node_type: KnowledgeNodeSummary['nodeType'];
  excerpt: string;
  tags: string[] | null;
  properties: Record<string, unknown> | null;
  company_id: string | null;
  company_name: string | null;
  visibility: KnowledgeNodeSummary['visibility'];
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  backlink_count: number | string;
  outbound_count: number | string;
  reference_count?: number | string;
};

type DetailRow = {
  node: {
    id: string;
    title: string;
    slug: string;
    node_type: KnowledgeNode['nodeType'];
    content_markdown: string;
    excerpt: string;
    tags: string[] | null;
    properties: Record<string, unknown> | null;
    company_id: string | null;
    visibility: KnowledgeNode['visibility'];
    created_by: string;
    updated_by: string;
    created_at: string;
    updated_at: string;
  };
  companyName: string | null;
  outgoing: KnowledgeOutgoingLink[] | null;
  backlinks: KnowledgeBacklink[] | null;
  versions: KnowledgeVersion[] | null;
  references: KnowledgeReference[] | null;
};

type SavedViewRow = {
  id: string;
  name: string;
  description: string;
  view_type: KnowledgeSavedView['viewType'];
  filters: KnowledgeSavedView['filters'] | null;
  sort_config: KnowledgeSavedView['sortConfig'] | null;
  columns: string[] | null;
  is_shared: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
};

const requireConfiguration = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Knowledge Vault requer VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no frontend.');
  }
};

const rpc = async <T>(session: SessionData | null, functionName: string, args: Record<string, unknown>): Promise<T> => {
  requireConfiguration();
  if (!session?.access_token) throw new Error('Sessão autenticada necessária para acessar o Knowledge Vault.');

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) as T | RpcError : null;

  if (!response.ok) {
    const error = payload as RpcError | null;
    throw new Error(error?.message ?? error?.details ?? `RPC ${functionName} falhou com status ${response.status}.`);
  }

  return payload as T;
};

const mapSummary = (row: NodeRow): KnowledgeNodeSummary => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  nodeType: row.node_type,
  excerpt: row.excerpt ?? '',
  tags: row.tags ?? [],
  properties: row.properties ?? {},
  companyId: row.company_id,
  companyName: row.company_name,
  visibility: row.visibility,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  backlinkCount: Number(row.backlink_count ?? 0),
  outboundCount: Number(row.outbound_count ?? 0),
  referenceCount: Number(row.reference_count ?? 0),
});

const mapDetail = (row: DetailRow): KnowledgeNodeDetail => ({
  node: {
    id: row.node.id,
    title: row.node.title,
    slug: row.node.slug,
    nodeType: row.node.node_type,
    contentMarkdown: row.node.content_markdown ?? '',
    excerpt: row.node.excerpt ?? '',
    tags: row.node.tags ?? [],
    properties: row.node.properties ?? {},
    companyId: row.node.company_id,
    visibility: row.node.visibility,
    createdBy: row.node.created_by,
    updatedBy: row.node.updated_by,
    createdAt: row.node.created_at,
    updatedAt: row.node.updated_at,
  },
  companyName: row.companyName ?? null,
  outgoing: row.outgoing ?? [],
  backlinks: row.backlinks ?? [],
  versions: row.versions ?? [],
  references: row.references ?? [],
});

const mapSavedView = (row: SavedViewRow): KnowledgeSavedView => ({
  id: row.id,
  name: row.name,
  description: row.description ?? '',
  viewType: row.view_type,
  filters: row.filters ?? {},
  sortConfig: row.sort_config ?? {},
  columns: row.columns ?? [],
  isShared: row.is_shared,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  canEdit: row.can_edit,
});

export const knowledgeVaultApi = {
  listNodes: async (
    session: SessionData | null,
    filters: { query?: string; nodeType?: string; companyId?: string; tag?: string } = {},
  ) => {
    const rows = await rpc<NodeRow[]>(session, 'knowledge_list_nodes', {
      p_query: filters.query?.trim() || null,
      p_node_type: filters.nodeType || null,
      p_company_id: filters.companyId || null,
      p_tag: filters.tag?.trim() || null,
    });
    return rows.map(mapSummary);
  },

  getNode: async (session: SessionData | null, nodeId: string) => {
    const row = await rpc<DetailRow | null>(session, 'knowledge_get_node', { p_node_id: nodeId });
    if (!row?.node) throw new Error('Nota não encontrada ou sem permissão de acesso.');
    return mapDetail(row);
  },

  saveNode: async (session: SessionData | null, input: SaveKnowledgeNodeInput) => {
    const row = await rpc<DetailRow>(session, 'knowledge_save_node', {
      p_node_id: input.id ?? null,
      p_title: input.title,
      p_node_type: input.nodeType,
      p_content_markdown: input.contentMarkdown,
      p_tags: input.tags,
      p_properties: input.properties ?? {},
      p_company_id: input.companyId ?? null,
      p_visibility: input.visibility,
    });
    return mapDetail(row);
  },

  archiveNode: (session: SessionData | null, nodeId: string) => (
    rpc<boolean>(session, 'knowledge_archive_node', { p_node_id: nodeId })
  ),

  getGraph: (session: SessionData | null, companyId?: string) => (
    rpc<KnowledgeGraphSnapshot>(session, 'knowledge_graph_snapshot', {
      p_company_id: companyId || null,
      p_limit: 160,
    })
  ),

  listSavedViews: async (session: SessionData | null) => {
    const rows = await rpc<SavedViewRow[]>(session, 'knowledge_list_saved_views', {});
    return rows.map(mapSavedView);
  },

  saveView: async (session: SessionData | null, input: SaveKnowledgeViewInput) => {
    return rpc<KnowledgeSavedView>(session, 'knowledge_save_view', {
      p_view_id: input.id ?? null,
      p_name: input.name,
      p_description: input.description ?? '',
      p_view_type: input.viewType ?? 'table',
      p_filters: input.filters,
      p_sort_config: input.sortConfig ?? {},
      p_columns: input.columns ?? [],
      p_is_shared: input.isShared ?? false,
    });
  },

  deleteView: (session: SessionData | null, viewId: string) => (
    rpc<boolean>(session, 'knowledge_delete_view', { p_view_id: viewId })
  ),

  getCompanyWorkspace: async (session: SessionData | null, companyId: string) => {
    const workspace = await rpc<KnowledgeCompanyWorkspace | null>(session, 'knowledge_company_workspace', {
      p_company_id: companyId,
    });
    if (!workspace?.company) throw new Error('Empresa não encontrada para o Knowledge Vault.');
    return workspace;
  },

  captureSignalNote: async (
    session: SessionData | null,
    signalId: string,
    visibility: KnowledgeVisibility = 'team',
  ) => {
    const row = await rpc<DetailRow>(session, 'knowledge_capture_signal_note', {
      p_signal_id: signalId,
      p_visibility: visibility,
    });
    return mapDetail(row);
  },

  captureMonitoringOutputNote: async (
    session: SessionData | null,
    monitoringOutputId: string,
    visibility: KnowledgeVisibility = 'team',
  ) => {
    const row = await rpc<DetailRow>(session, 'knowledge_capture_monitoring_output_note', {
      p_monitoring_output_id: monitoringOutputId,
      p_visibility: visibility,
    });
    return mapDetail(row);
  },

  captureQualificationNote: async (
    session: SessionData | null,
    companyId: string,
    visibility: KnowledgeVisibility = 'team',
  ) => {
    const row = await rpc<DetailRow>(session, 'knowledge_capture_qualification_note', {
      p_company_id: companyId,
      p_visibility: visibility,
    });
    return mapDetail(row);
  },
};
