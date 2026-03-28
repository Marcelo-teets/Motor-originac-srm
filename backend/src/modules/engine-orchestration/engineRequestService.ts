import type { EngineRequestRecord } from './types.js';

export const normalizeEngineRequest = (request: EngineRequestRecord): EngineRequestRecord => ({
  ...request,
  priority: request.priority ?? 'medium',
  status: request.status ?? 'queued',
  evidencePayload: request.evidencePayload ?? {},
  responsePayload: request.responsePayload ?? {},
});
