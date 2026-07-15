import fs from 'node:fs';

const path = 'backend/src/services/capitalMarketIngestionService.ts';
let source = fs.readFileSync(path, 'utf8');
const before = `    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));

    try {
      const resources = await discoverCvmResources(datasetCode, options.reference);
      const incremental = options.triggerType === 'schedule' && !options.reference;`;
const after = `    const checkpoints = new Map(checkpointRows.map((row) => [row.resource_key, row]));
    const incremental = options.triggerType === 'schedule' && !options.reference;

    try {
      const resources = await discoverCvmResources(datasetCode, options.reference);`;
if (!source.includes(before)) throw new Error('Incremental scope anchor not found');
source = source.replace(before, after);
fs.writeFileSync(path, source);
