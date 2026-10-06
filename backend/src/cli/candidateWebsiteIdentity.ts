import { CandidateWebsiteIdentityService } from '../services/candidateWebsiteIdentityService.js';
import { parseCliArgs } from './args.js';

const { valueFor } = parseCliArgs();

const parsedLimit = Number(valueFor('limit') ?? 30);
const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 30;

const service = new CandidateWebsiteIdentityService();
const result = await service.run({ limit });
console.log(JSON.stringify(result, null, 2));
if (result.errors > 0) process.exitCode = 1;
