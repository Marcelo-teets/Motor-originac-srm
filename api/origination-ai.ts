import type { IncomingMessage, ServerResponse } from 'node:http';
import { originationIntroAgents } from '../backend/src/ai/originationAgentDefinitions.js';
import { OriginationAiService } from '../backend/src/services/originationAiService.js';

const RUNTIME = 'origination-ai-intro-mvp-v1';

const writeJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Origination-Runtime': RUNTIME,
    'X-Robots-Tag': 'noindex',
  });
  res.end(JSON.stringify(payload));
};

const getHeader = (req: IncomingMessage, key: string) => {
  const value = req.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const parseUrl = (req: IncomingMessage) => {
  const host = getHeader(req, 'host') ?? 'localhost';
  return new URL((req as { url?: string }).url ?? '/', `https://${host}`);
};

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, any>;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const authorization = getHeader(req, 'authorization');
  if (!authorization?.startsWith('Bearer ')) {
    writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Missing bearer token.' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ? normalizeBaseUrl(process.env.SUPABASE_URL) : '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) {
    writeJson(res, 503, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Supabase Auth is not configured.' });
    return;
  }

  try {
    const accessToken = authorization.slice('Bearer '.length);
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } });
    if (!authResponse.ok) {
      writeJson(res, 401, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unauthorized.' });
      return;
    }
    const authUser = await authResponse.json() as { id?: string; email?: string };
    const url = parseUrl(req);
    const action = url.searchParams.get('action') ?? 'agents';
    const companyId = url.searchParams.get('companyId') ?? '';
    const conflictId = url.searchParams.get('conflictId') ?? '';
    const artifactId = url.searchParams.get('artifactId') ?? '';
    const method = (req.method ?? 'GET').toUpperCase();
    const service = new OriginationAiService();
    const body = method === 'POST' ? await readBody(req) : {};
    let data: unknown;

    if (method === 'GET' && action === 'agents') data = originationIntroAgents;
    else if (!companyId) throw new Error('companyId é obrigatório.');
    else if (method === 'GET' && action === 'evidence') data = await service.getEvidence(companyId);
    else if (method === 'POST' && action === 'evidence') data = await service.ingestEvidence(companyId, body as any);
    else if (method === 'POST' && action === 'rebuild') data = await service.rebuildDealMaster(companyId);
    else if (method === 'GET' && action === 'deal-master') data = await service.getDealMaster(companyId);
    else if (method === 'GET' && action === 'conflicts') data = await service.getConflicts(companyId);
    else if (method === 'POST' && action === 'resolve-conflict') {
      if (!conflictId) throw new Error('conflictId é obrigatório.');
      data = await service.resolveConflict(companyId, conflictId, {
        selectedEvidenceId: body.selectedEvidenceId ? String(body.selectedEvidenceId) : undefined,
        resolutionNote: String(body.resolutionNote ?? ''),
        resolvedBy: authUser.email ?? authUser.id ?? 'authenticated-user',
      });
    }
    else if (method === 'POST' && action === 'readiness') data = await service.recalculateReadiness(companyId);
    else if (method === 'POST' && action === 'generate-intro') data = await service.generateIntro(companyId);
    else if (method === 'GET' && action === 'intro') data = await service.getLatestIntro(companyId);
    else if (method === 'POST' && action === 'approve-intro') {
      if (!artifactId) throw new Error('artifactId é obrigatório.');
      data = await service.approveIntro(companyId, artifactId, authUser.email ?? authUser.id ?? 'authenticated-user');
    }
    else {
      writeJson(res, 405, { status: 'partial', generatedAt: new Date().toISOString(), error: 'Unsupported method/action.' });
      return;
    }

    writeJson(res, method === 'POST' ? 201 : 200, { status: 'real', generatedAt: new Date().toISOString(), data });
  } catch (error) {
    console.error('[origination-ai]', error);
    const message = error instanceof Error ? error.message : String(error);
    const clientError = /obrigat|não encontrada|não disponível|NOT_READY|Conflito crítico/i.test(message);
    writeJson(res, clientError ? 400 : 500, { status: 'partial', generatedAt: new Date().toISOString(), error: message });
  }
}
