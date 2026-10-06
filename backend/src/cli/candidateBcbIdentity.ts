import { CandidateBcbIdentityService } from '../services/candidateBcbIdentityService.js';
import { parseCliArgs } from './args.js';

const { valueFor } = parseCliArgs();

const parsedLimit = Number(valueFor('limit') ?? 100);
const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 100;

const service = new CandidateBcbIdentityService();
const result = await service.run({ limit });
console.log(JSON.stringify(result, null, 2));
if (result.errors > 0) process.exitCode = 1;
