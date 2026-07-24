import { CandidateCvmRegistryService } from '../services/candidateCvmRegistryService.js';

const args = process.argv.slice(2);
const valueFor = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const trigger = valueFor('--trigger');
const triggerType = trigger === 'schedule' || trigger === 'backfill' ? trigger : 'manual';
const force = args.includes('--force');

const service = new CandidateCvmRegistryService();
const result = await service.run({ triggerType, force });
console.log(JSON.stringify(result, null, 2));
if (result.status === 'failed') process.exitCode = 1;
