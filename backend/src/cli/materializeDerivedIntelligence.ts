import { DerivedIntelligenceMaterializationService } from '../services/derivedIntelligenceMaterializationService.js';

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Math.min(100, Number(limitArg?.slice('--limit='.length) ?? 25) || 25));

const result = await new DerivedIntelligenceMaterializationService().run(limit);
console.log(JSON.stringify(result));

if (result.status !== 'real') process.exitCode = 1;
