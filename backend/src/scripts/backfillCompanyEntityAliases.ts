import { CompanyEntityResolutionService } from '../services/companyEntityResolutionService.js';

const service = new CompanyEntityResolutionService();
const summary = await service.backfillCanonicalAliases();

console.log(JSON.stringify(summary, null, 2));

if (summary.errors.length) {
  process.exitCode = 1;
}
