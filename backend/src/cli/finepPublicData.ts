import { FinepPublicIngestionService } from '../services/finepPublicIngestionService.js';
import { parseCliArgs } from './args.js';

const { args, valueFor } = parseCliArgs();
const positiveInteger = (name: string, fallback: number, maximum: number) => {
  const parsed = Number(valueFor(name) ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} must be a positive number.`);
  return Math.max(1, Math.min(Math.trunc(parsed), maximum));
};
const triggerType = (valueFor('trigger') ?? 'manual') as 'manual' | 'schedule' | 'backfill';
if (!['manual', 'schedule', 'backfill'].includes(triggerType)) throw new Error(`Invalid --trigger: ${triggerType}`);

const result = await new FinepPublicIngestionService().run({
  triggerType,
  maxMatchedRows: positiveInteger('max-matched-rows', 100_000, 1_000_000),
  discoverOnly: args.includes('--discover-only'),
  force: args.includes('--force'),
});

console.log(JSON.stringify(result, null, 2));
if (result.status === 'failed') process.exitCode = 1;
if (args.includes('--require-scan') && Number(result.totals?.rowsScanned ?? 0) <= 0) {
  console.error('Finep ingestion completed without scanning workbook rows.');
  process.exitCode = 1;
}
if (args.includes('--require-matches') && Number(result.totals?.recordsMatched ?? 0) <= 0) {
  console.error('Finep ingestion completed without matching governed Company Master CNPJs.');
  process.exitCode = 1;
}
if (args.includes('--require-zero-errors') && Array.isArray(result.errors) && result.errors.length > 0) {
  console.error(`Finep ingestion completed with ${result.errors.length} errors.`);
  process.exitCode = 1;
}
