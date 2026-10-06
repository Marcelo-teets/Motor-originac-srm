import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyActiveIdentity } from '../serverless/neon-auth.js';
import { requireNeonDataClient } from '../serverless/neon-data.js';
import { readJsonObjectBody } from './http-body.js';

const RUNTIME = 'knowledge-rpc-neon-v1';

const ALLOWED_FUNCTIONS = new Set([
  'knowledge_list_nodes',
  'knowledge_get_node',
  'knowledge_save_node',
  'knowledge_archive_node',
  'knowledge_graph_snapshot',
  'knowledge_list_saved_views',
  'knowledge_save_view',
  'knowledge_delete_view',
  'knowledge_company_workspace',
  'knowledge_company_execution_workspace',
  'knowledge_create_execution_action',
  'knowledge_complete_execution_action',
  'knowledge_capture_signal_note',
  'knowledge_capture_monitoring_output_note',
  'knowledge_capture_qualification_note',
  'knowledge_outcome_intelligence',
  'knowledge_outcome_operations',
  'knowledge_adopt_existing_activity',
  'knowledge_capture_existing_activity_outcome',
  'knowledge_learning_status',
  'knowledge_enqueue_company_learning',
  'knowledge_embedding_coverage',
]);

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Origination-Runtime': RUNTIME,
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, name: string) => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const readBody = (req: IncomingMessage) => readJsonObjectBody(req, 256_000);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
    writeJson(res, 405, { status: 'partial', error: 'Method not allowed.' });
    return;
  }

  try {
    const authorization = getHeader(req, 'authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw Object.assign(new Error('Missing bearer token.'), { statusCode: 401 });
    }

    const accessToken = authorization.slice('Bearer '.length);
    const identity = await verifyActiveIdentity(accessToken);
    const body = await readBody(req);
    const functionName = String(body.functionName ?? '').trim();
    const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args)
      ? body.args as Record<string, unknown>
      : {};

    if (!ALLOWED_FUNCTIONS.has(functionName)) {
      throw Object.assign(new Error('Knowledge RPC is not allowed.'), { statusCode: 403 });
    }

    const data = await requireNeonDataClient().rpcAsUser(functionName, args, {
      id: identity.user.id,
      email: identity.user.email,
      role: 'authenticated',
    });

    writeJson(res, 200, data);
  } catch (error) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode) || 500
      : error instanceof SyntaxError ? 400 : 500;
    console.error('[knowledge-rpc]', error);
    writeJson(res, statusCode, {
      status: 'partial',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
