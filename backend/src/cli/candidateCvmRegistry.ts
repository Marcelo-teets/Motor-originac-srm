import { CandidateCvmRegistryService } from '../services/candidateCvmRegistryService.js';
import { parseCliArgs } from './args.js';

const { args, valueFor } = parseCliArgs();
const trigger = valueFor('trigger');
const triggerType = trigger === 'schedule' || trigger === 'backfill' ? trigger : 'manual';
const force = args.includes('--force');

const service = new CandidateCvmRegistryService();
const result = await service.run({ triggerType, force });
console.log(JSON.stringify(result, null, 2));
if (result.status === 'failed') process.exitCode = 1;
