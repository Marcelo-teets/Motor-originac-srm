import { CandidateBcbIdentityService } from '../services/candidateBcbIdentityService.js';

const args = process.argv.slice(2);
const valueFor = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const parsedLimit = Number(valueFor('--limit') ?? 100);
const limit = Number.isFinite(parsedLimit) ? Math.trunc(parsedLimit) : 100;

const service = new CandidateBcbIdentityService();
const result = await service.run({ limit });
console.log(JSON.stringify(result, null, 2));
if (result.errors > 0) process.exitCode = 1;
