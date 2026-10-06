import { BndesAutomaticDatastoreService } from '../services/bndesAutomaticDatastoreService.js';
import { PublicDataDownstreamService } from '../services/publicDataDownstreamService.js';
import { parseCliArgs } from './args.js';

const { args, valueFor, positiveNumber } = parseCliArgs();
const ingestion = await new BndesAutomaticDatastoreService().run({
  targetBatchSize: positiveNumber('target-batch-size', 25),
  maxTargetBatches: positiveNumber('max-target-batches', 100),
  pageSize: positiveNumber('page-size', 1_000),
  maxPagesPerTargetBatch: positiveNumber('max-pages-per-target-batch', 100),
  triggerType: (valueFor('trigger') as 'manual' | 'schedule' | 'backfill' | undefined) ?? 'manual',
  force: args.includes('--force'),
});

const downstream = ingestion.recordsMatched > 0 && ingestion.status !== 'failed'
  ? await new PublicDataDownstreamService().sync(['bndes_financing_operations'])
  : null;

const result = { ingestion, downstream };
console.log(JSON.stringify(result, null, 2));

if (ingestion.status === 'failed' || downstream?.status === 'partial') process.exitCode = 1;
if (args.includes('--require-progress') && !['completed', 'up_to_date'].includes(ingestion.status) && ingestion.targetBatchesProcessed <= 0) {
  console.error('BNDES automatic ingestion completed without target progress.');
  process.exitCode = 1;
}
if (args.includes('--require-complete') && !['completed', 'up_to_date'].includes(ingestion.status)) {
  console.error('BNDES automatic target coverage is not complete.');
  process.exitCode = 1;
}
