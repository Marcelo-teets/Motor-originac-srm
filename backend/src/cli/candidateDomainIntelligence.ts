import { CandidateDomainIntelligenceService } from '../services/candidateDomainIntelligenceService.js';
import { parseCliArgs } from './args.js';

const { args, valueFor } = parseCliArgs();
const hasFlag = (flag: string) => args.includes(flag);

const parsedLimit = Number(valueFor('limit') ?? 50);
const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 50;
const tiers = String(valueFor('tiers') ?? 'P1,P2,P3')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const candidateIds = args
  .flatMap((arg, index) => arg === '--candidate-id' ? [args[index + 1]] : [])
  .filter((value): value is string => Boolean(value));

const service = new CandidateDomainIntelligenceService();
const result = await service.run({
  limit,
  tiers,
  candidateIds,
  force: hasFlag('--force'),
});

console.log(JSON.stringify(result, null, 2));
if (result.errors > 0) process.exitCode = 1;
