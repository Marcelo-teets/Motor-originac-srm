import { CandidateNewsSemanticsService } from '../services/candidateNewsSemanticsService.js';
import { parseCliArgs } from './args.js';

const { args, valueFor } = parseCliArgs();

const parsedLimit = Number(valueFor('limit') ?? 250);
const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 250;
const force = args.includes('--force');

const service = new CandidateNewsSemanticsService();
const result = await service.run({ limit, force });
console.log(JSON.stringify(result, null, 2));
if (result.errors > 0) process.exitCode = 1;
