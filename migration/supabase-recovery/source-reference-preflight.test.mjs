import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateSourceReferencePreflight, AUDITED_REFERENCE_TABLES} from './source-reference-preflight.mjs';
const old = (id, code, url='https://www.cvm.gov.br/feed', source_type='api') =>
  ({id, code, url, source_type});
const refs = () => Object.fromEntries(AUDITED_REFERENCE_TABLES.map(table => [table, []]));
const run = (sources, dest, references=refs()) => evaluateSourceReferencePreflight(
  {sources, references}, {sources:dest});

test('same unique code, official host and type yields only technical candidate', () => {
  const references=refs();
  references.company_signals=[{id:'old-id',rows:'9'},{id:null,rows:'2'}];
  references.monitoring_outputs=[{id:'old-id',rows:'13'}];
  const report=run([old('old-id','cvm_fidc')],[old('new-id',' CVM_FIDC ','https://cvm.gov.br/other')],references);
  assert.equal(report.sourceCatalogues.technicalCandidate,1);
  assert.equal(report.sourceCatalogues.sameCodeDifferentUuid,1);
  assert.equal(report.references.company_signals.technicalCandidateOnly,9);
  assert.equal(report.references.company_signals.unassignedSource,2);
  assert.equal(report.references.monitoring_outputs.technicalCandidateOnly,13);
  assert.equal(report.signalImportAllowed,false);
  assert.equal(report.cutoverApproved,false);
  assert.doesNotMatch(JSON.stringify(report),/cvm_fidc|old-id|new-id|cvm\.gov/);
});

test('contract mismatch and missing evidence never match automatically', () => {
  const report=run([
    old('a','a','https://foo.example/api','rss'),
    old('b','b','http://bar.example/feed'),
    old('c','c','https://x.example',''),
  ],[
    old('a2','a','https://bar.example/api','rss'),
    old('b2','b','http://bar.example/feed'),
    old('c2','c','https://x.example',''),
  ]);
  assert.equal(report.sourceCatalogues.contractMismatch,1);
  assert.equal(report.sourceCatalogues.insufficientContractEvidence,2);
  assert.equal(report.sourceCatalogues.technicalCandidate,0);
});

test('duplicate codes, unknown codes and conflicting reused UUIDs are isolated', () => {
  const report=run([
    old('x1','dup'),old('x2','dup'),
    old('x3','missing'),
    old('x4','conflict'),
    old('x5','shared'),
  ],[
    old('target1','dup'),old('target2','dup'),
    old('target3','conflict'),old('x4','different'),
    old('target4','shared'),old('target5','shared'),
  ]);
  assert.equal(report.sourceCatalogues.duplicateSourceCodeOrId,2);
  assert.equal(report.sourceCatalogues.unmatchedCode,1);
  assert.equal(report.sourceCatalogues.uuidIdentityConflict,1);
  assert.equal(report.sourceCatalogues.duplicateDestinationCodeOrId,1);
});

test('malformed counters are not coerced to zero and reports fail closed', () => {
  const references=refs();
  references.company_signals=[{id:'a',rows:null},{id:'a',rows:'12'},
    {id:'a',rows:false},{id:'a',rows:'2e3'}, {id:'a',rows:'0002'}];
  const report=run([old('a','key')],[old('b','key')],references);
  assert.equal(report.references.company_signals.totalRows,12);
  assert.equal(report.references.company_signals.invalidCounters,4);
  assert.equal(report.signalImportAllowed,false);
  assert.throws(() => run([],[],{}),/Missing grouped references/);
  const oversized=run([],[],{...refs(),company_signals:[{id:'a',rows:'9007199254740992'}]});
  assert.equal(oversized.references.company_signals.invalidCounters,1);
});

test('source catalogue SQL only reads official catalog and grouped references', () => {
  const contents=readFileSync(new URL('./source-reference-preflight.mjs',import.meta.url),'utf8');
  assert.match(contents,/REPEATABLE READ READ ONLY/);
  assert.match(contents,/assertAuditConnections\(supabaseUrl, neonUrl\)/);
  assert.match(contents,/GROUP BY source_id/);
  assert.match(contents,/metadata->>'baseUrl'/);
  assert.match(contents,/nullif\(btrim\(url\),''\)/);
  assert.doesNotMatch(contents,/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b\s+(?:INTO\s+|FROM\s+|TABLE\s+)?public\./i);
});
