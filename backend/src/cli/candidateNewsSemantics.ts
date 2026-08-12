import { CandidateNewsSemanticsService } from '../services/candidateNewsSemanticsService.js';

const args = process.argv.slice(2);
const valueFor = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const parsedLimit = Number(valueFor('--limit') ?? 250);
const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 250;
const force = args.includes('--force');

const service = new CandidateNewsSemanticsService();
const result = await service.run({ limit, force });
console.log(JSON.stringify(result, null, 2));
if (result.errors > 0) process.exitCode = 1;
