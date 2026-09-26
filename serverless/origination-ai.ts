import type { VercelRequest, VercelResponse } from '../api/vercelTypes.js';
import { originationIntroAgents } from '../backend/src/ai/originationAgentDefinitions.js';
import { OriginationAiService } from '../backend/src/services/originationAiService.js';

type RequestWithBody = VercelRequest & { body?: Record<string, any> };
type AuthUser = { id: string; email?: string };

const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const ok = (res: VercelResponse, statusCode: number, data: unknown) => res.status(statusCode).json({
  status: 'real', generatedAt: new Date().toISOString(), data,
});

export const handleOriginationAi = async (req: RequestWithBody, res: VercelResponse, authUser: AuthUser) => {
  const action = one(req.query.action) ?? 'agents';
  const companyId = one(req.query.companyId) ?? '';
  const conflictId = one(req.query.conflictId) ?? '';
  const artifactId = one(req.query.artifactId) ?? '';
  const method = (req.method ?? 'GET').toUpperCase();
  const service = new OriginationAiService();
  const body = req.body ?? {};

  if (method === 'GET' && action === 'agents') return ok(res, 200, originationIntroAgents);
  if (!companyId) throw Object.assign(new Error('companyId é obrigatório.'), { statusCode: 400 });

  if (method === 'GET' && action === 'evidence') return ok(res, 200, await service.getEvidence(companyId));
  if (method === 'POST' && action === 'evidence') return ok(res, 201, await service.ingestEvidence(companyId, body as any));
  if (method === 'POST' && action === 'rebuild') return ok(res, 200, await service.rebuildDealMaster(companyId));
  if (method === 'GET' && action === 'deal-master') return ok(res, 200, await service.getDealMaster(companyId));
  if (method === 'GET' && action === 'conflicts') return ok(res, 200, await service.getConflicts(companyId));
  if (method === 'POST' && action === 'resolve-conflict') {
    if (!conflictId) throw Object.assign(new Error('conflictId é obrigatório.'), { statusCode: 400 });
    return ok(res, 200, await service.resolveConflict(companyId, conflictId, {
      selectedEvidenceId: body.selectedEvidenceId ? String(body.selectedEvidenceId) : undefined,
      resolutionNote: String(body.resolutionNote ?? ''),
      resolvedBy: authUser.email ?? authUser.id,
    }));
  }
  if (method === 'POST' && action === 'readiness') return ok(res, 200, await service.recalculateReadiness(companyId));
  if (method === 'POST' && action === 'generate-intro') return ok(res, 201, await service.generateIntro(companyId));
  if (method === 'GET' && action === 'intro') return ok(res, 200, await service.getLatestIntro(companyId));
  if (method === 'POST' && action === 'approve-intro') {
    if (!artifactId) throw Object.assign(new Error('artifactId é obrigatório.'), { statusCode: 400 });
    return ok(res, 200, await service.approveIntro(companyId, artifactId, authUser.email ?? authUser.id));
  }

  throw Object.assign(new Error('Unsupported method/action.'), { statusCode: 405 });
};
