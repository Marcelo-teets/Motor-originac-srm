import { createPlatformRepository } from '../backend/src/repositories/platformRepository.js';
import { PlatformService } from '../backend/src/services/platformService.js';

const companyId = String(process.env.COMPANY_ID ?? '').trim();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!uuidPattern.test(companyId)) {
  throw new Error('COMPANY_ID must be a valid UUID.');
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}
if (process.env.USE_SUPABASE !== 'true') {
  throw new Error('USE_SUPABASE=true is required to prevent local-memory materialization.');
}

const service = new PlatformService(createPlatformRepository('supabase'));
const snapshots = await service.recomputeDerivedData(companyId);
const summary = {
  companyId,
  generatedAt: snapshots.generatedAt,
  qualificationCount: snapshots.qualifications.length,
  patternCount: snapshots.patterns.length,
  scoreCount: snapshots.scoreSnapshots.length,
  leadScoreCount: snapshots.leadScoreSnapshots.length,
};

if (summary.qualificationCount !== 1 || summary.scoreCount < 1 || summary.leadScoreCount !== 1) {
  throw new Error(`Decision materialization did not generate the expected scoped records: ${JSON.stringify(summary)}`);
}

console.log(JSON.stringify(summary));
