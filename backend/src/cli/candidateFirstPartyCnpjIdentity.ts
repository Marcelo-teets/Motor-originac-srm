import { CandidateFirstPartyCnpjIdentityService } from '../services/candidateFirstPartyCnpjIdentityService.js';
import { parseCliArgs } from './args.js';

const { valueFor } = parseCliArgs();
const parsedLimit = Number(valueFor('limit') ?? 20);
const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 20;

const service = new CandidateFirstPartyCnpjIdentityService();
const result = await service.run({ limit });
console.log(JSON.stringify(result, null, 2));
if (result.errors > 0) process.exitCode = 1;
