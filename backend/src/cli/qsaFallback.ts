import { QsaFallbackIngestionService } from '../services/qsaFallbackIngestionService.js';

const args = process.argv.slice(2);
const valueFor = (name: string) => {
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const integerOption = (name: string, fallback: number, maximum: number) => {
  const parsed = Number(valueFor(name) ?? fallback);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${valueFor(name)}`);
  return Math.max(1, Math.min(Math.trunc(parsed), maximum));
};

const trigger = (valueFor('trigger') ?? 'manual') as 'manual' | 'schedule' | 'backfill';
if (!['manual', 'schedule', 'backfill'].includes(trigger)) {
  throw new Error(`Invalid --trigger: ${trigger}`);
}

const result = await new QsaFallbackIngestionService().run({
  companyId: valueFor('company-id'),
  force: args.includes('--force'),
  maxCompanies: integerOption('max-companies', 500, 5_000),
  triggerType: trigger,
});

console.log(JSON.stringify(result, null, 2));

if (result.status === 'failed') process.exitCode = 1;
if (args.includes('--require-output')) {
  const outputsAvailable = Number(result.totals?.outputsAvailable ?? result.totals?.outputsWritten ?? 0);
  const recordsWritten = Number(result.totals?.recordsWritten ?? 0);
  if (outputsAvailable <= 0 || recordsWritten <= 0) {
    console.error(JSON.stringify({
      error: 'QSA fallback ingestion did not provide monitoring evidence.',
      outputsAvailable,
      recordsWritten,
    }));
    process.exitCode = 1;
  }
}
if (args.includes('--require-zero-signals')) {
  const signalsWritten = Number(result.totals?.signalsWritten ?? 0);
  if (signalsWritten !== 0) {
    console.error(JSON.stringify({
      error: 'QSA fallback ingestion unexpectedly wrote signals.',
      signalsWritten,
    }));
    process.exitCode = 1;
  }
}
