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

  // Deal Card v1 operates on opportunityId, never on the company alone.
  // Every action below performs opportunity-member access control in the service.
  if (action.startsWith('deal-')) {
    const { DealCardService } = await import('../backend/src/services/dealCardService.js');
    const dealService = new DealCardService();
    const dealId = one(req.query.dealId) ?? '';
    if (method === 'GET' && action === 'deal-list')
      return ok(res, 200, await dealService.list(authUser.id, companyId || undefined));
    if (method === 'POST' && action === 'deal-create')
      return ok(res, 201, await dealService.create(authUser.id, {
        companyId: String(body.companyId ?? companyId),
        title: String(body.title ?? ''), product: body.product ? String(body.product) : undefined,
        revisitOf: body.revisitOf ? String(body.revisitOf) : null,
      }));
    if (!dealId) throw Object.assign(new Error('dealId é obrigatório.'), { statusCode: 400 });
    // Shared Fireflies key is opt-in and reserved to the named deal owner.
    if (method === 'POST' && action === 'deal-import-fireflies') {
      if (process.env.DEAL_CARD_FIREFLIES_ENABLED !== 'true') {
        throw Object.assign(new Error('Conector Fireflies não habilitado pela SRM.'), { statusCode: 503 });
      }
      await dealService.assertOwner(dealId, authUser.id);
      const meetingId = typeof body.meetingId === 'string' ? body.meetingId : '';
      const { fetchFirefliesById, captureFromExternal } = await import('../backend/src/modules/dealExternalSources.js');
      const source = await fetchFirefliesById(meetingId, process.env.FIREFLIES_API_KEY ?? '');
      const captured = await dealService.capture(dealId, authUser.id, captureFromExternal(source, dealId));
      const card = captured.status === 'ingested' ? await dealService.rebuild(dealId, authUser.id) : null;
      return ok(res, 201, { captured, cardVersion: (card as any)?.snapshot?.version ?? null });
    }
    if (method === 'GET' && action === 'deal-card')
      return ok(res, 200, await dealService.getCard(dealId, authUser.id));
    if (method === 'GET' && action === 'deal-evidence')
      return ok(res, 200, await dealService.getEvidence(dealId, authUser.id));
    if (method === 'POST' && action === 'deal-capture')
      return ok(res, 201, await dealService.capture(dealId, authUser.id, body as any));
    if (method === 'POST' && action === 'deal-review-claim')
      return ok(res, 200, await dealService.reviewClaim(dealId, authUser.id, {
        claimId: String(body.claimId ?? ''), status: String(body.status ?? ''),
        note: String(body.note ?? ''),
      }));
    if (method === 'POST' && action === 'deal-add-event')
      return ok(res, 201, await dealService.addEvent(dealId, authUser.id, body as any));
    if (method === 'POST' && action === 'deal-link-originator')
      return ok(res, 200, await dealService.linkOriginator(dealId, authUser.id, body as any));
    if (method === 'POST' && action === 'deal-create-originator')
      return ok(res, 201, await dealService.createOriginator(dealId, authUser.id, body as any));
    if (method === 'POST' && action === 'deal-add-member')
      return ok(res, 200, await dealService.addMember(dealId, authUser.id, body as any));
    if (method === 'POST' && action === 'deal-rebuild')
      return ok(res, 201, await dealService.rebuild(dealId, authUser.id));
    if (method === 'POST' && action === 'deal-approve')
      return ok(res, 200, await dealService.approveCard(dealId, authUser.id, String(body.snapshotId ?? '')));
    throw Object.assign(new Error('Unsupported Deal Card action.'), { statusCode: 405 });
  }

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
