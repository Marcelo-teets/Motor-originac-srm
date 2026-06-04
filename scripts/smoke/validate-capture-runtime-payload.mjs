import { readFileSync } from 'node:fs';

const inputPath = process.argv[2];
const raw = inputPath ? readFileSync(inputPath, 'utf8') : await new Promise((resolve) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { data += chunk; });
  process.stdin.on('end', () => resolve(data));
});

const payload = JSON.parse(String(raw));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(payload && typeof payload === 'object', 'Payload must be an object.');
assert(['real', 'partial'].includes(payload.status), `Unexpected top-level status: ${payload.status}`);
assert(payload.generatedAt, 'Missing generatedAt.');
assert(payload.operational && typeof payload.operational === 'object', 'Missing operational diagnostics.');
assert(['real', 'partial'].includes(payload.operational.status), `Unexpected operational.status: ${payload.operational.status}`);
assert([200, 207, 500].includes(Number(payload.operational.httpStatus)), `Unexpected operational.httpStatus: ${payload.operational.httpStatus}`);
assert(typeof payload.operational.decision === 'string' && payload.operational.decision.trim(), 'Missing operational.decision.');
assert(typeof payload.operational.nextAction === 'string' && payload.operational.nextAction.trim(), 'Missing operational.nextAction.');

const data = payload.data || {};
assert(data.requested && typeof data.requested === 'object', 'Missing data.requested.');
assert(typeof data.companiesProcessed === 'number', 'Missing data.companiesProcessed.');
assert(typeof data.outputsCollected === 'number', 'Missing data.outputsCollected.');
assert(data.persisted && typeof data.persisted === 'object', 'Missing data.persisted.');
assert(typeof data.persisted.runsWritten === 'number', 'Missing data.persisted.runsWritten.');
assert(typeof data.persisted.outputsWritten === 'number', 'Missing data.persisted.outputsWritten.');
assert(typeof data.persisted.signalsWritten === 'number', 'Missing data.persisted.signalsWritten.');
assert(typeof data.persisted.enrichmentsWritten === 'number', 'Missing data.persisted.enrichmentsWritten.');

console.log(JSON.stringify({
  ok: true,
  status: payload.status,
  generatedAt: payload.generatedAt,
  operational: payload.operational,
  counts: {
    companiesProcessed: data.companiesProcessed,
    outputsCollected: data.outputsCollected,
    runsWritten: data.persisted.runsWritten,
    outputsWritten: data.persisted.outputsWritten,
    signalsWritten: data.persisted.signalsWritten,
    enrichmentsWritten: data.persisted.enrichmentsWritten,
  },
}, null, 2));
