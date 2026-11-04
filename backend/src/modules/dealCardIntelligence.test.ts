import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleDealCard, normalizeCapture, type Opportunity, type DealClaim, type DealSource } from './dealCardIntelligence.js';

const id = 'd1111111-1111-4111-8111-111111111111';
const otherId = 'd2222222-2222-4222-8222-222222222222';
const opportunity: Opportunity = {
  id, companyId: 'c1111111-1111-4111-8111-111111111111',
  title: 'FIDC expansão carteira', product: 'FIDC', stage: 'qualificacao',
  status: 'active', ownerUserId: 'u1',
};
const source = (sourceId: string, provider: DealSource['provider'] = 'fireflies', opportunityId = id): DealSource => ({
  id: sourceId, opportunityId, provider, externalId: sourceId, title: sourceId,
  contentHash: 'hash', ingestedAt: '2026-11-03T10:00:00Z', matchMethod: 'human_approved',
});
const claim = (eid: string, sourceId: string, field: string, value: unknown, options: Partial<DealClaim> = {}): DealClaim => ({
  id: eid, sourceId, opportunityId: id, field, value, status: 'proposed',
  confidence: 0.8, claimType: 'fact', materiality: 'medium', ...options,
});
test('rejects unnamed association; Fireflies transcript is quarantined', () => {
  const value = normalizeCapture({ provider: 'fireflies', externalId: 'ff-123', title: 'Reunião', content: 'texto', opportunityId: id });
  assert.equal(value.state, 'quarantine');
  assert.equal(value.source, null);
});
test('idempotent ingest fingerprints; raw meeting text is never persisted in the source', () => {
  const input = { provider: 'outlook_email' as const, externalId: 'mail-1', title: 'Funding', opportunityId: id,
    mappingApproved: true, content: 'Informação confidencial', claims: [{ field: 'requestedAmount', value: 50_000_000 }] };
  const a = normalizeCapture(input);
  const b = normalizeCapture(input);
  assert.equal(a.state, 'ready');
  assert.equal(a.source?.sourceKey, b.source?.sourceKey);
  assert.equal(a.claims[0]?.status, 'proposed');
  assert.equal(JSON.stringify(a).includes('Informação confidencial'), false);
});
test('material divergence in same period blocks; no silent source override', () => {
  const card = assembleDealCard({ opportunity, sources: [source('a'),source('b','outlook_email')],
    claims: [
      claim('f1','a','requestedAmount',30_000_000,{materiality:'critical'}),
      claim('f2','b','requestedAmount',50_000_000,{materiality:'critical'}),
    ], events: [], generatedAt: '2026-11-03T10:00:00Z' });
  assert.equal(card.fields.requestedAmount.status,'disputed');
  assert.equal(card.fields.requestedAmount.value,null);
  assert.equal(card.readiness.status,'BLOCKED');
  assert.equal(card.conflicts[0]?.evidenceIds.length,2);
});
test('different reference periods do not conflict', () => {
  const card = assembleDealCard({ opportunity, sources:[source('a')],
    claims:[claim('f1','a','financials',{revenue:10},{period:'2025'}),
      claim('f2','a','financials',{revenue:20},{period:'2026'})],events:[] });
  assert.equal(card.conflicts.length,0);
  assert.ok(card.fields['financials@2025']);
  assert.ok(card.fields['financials@2026']);
});
test('separate deals under the same company never contaminate the card', () => {
  const card = assembleDealCard({opportunity,sources:[source('a'),source('b','teams',otherId)],
    claims:[claim('f1','a','requestedAmount',50_000_000),
      claim('f2','b','requestedAmount',300_000_000,{opportunityId:otherId})],
    events:[{id:'e1',opportunityId:otherId,type:'decision',title:'Outro deal',happenedAt:'2026-11-03T10:00:00Z'}]});
  assert.deepEqual(card.fields.requestedAmount.evidenceIds,['f1']);
  assert.equal(card.history.length,0);
  assert.equal(card.sources.length,1);
});
test('only validated product-specific fields satisfy FIDC checklist', () => {
  const fields = ['financialNeed','requestedAmount','receivables','loanTape','contract','assignmentEligibility','financials'];
  const card = assembleDealCard({opportunity,sources:[source('a')],claims:fields.map((f,i)=>claim('f'+i,'a',f,i+1,
    {status: i === 0 ? 'proposed' : 'validated'})),events:[]});
  assert.deepEqual(card.readiness.missing,['financialNeed']);
  assert.equal(card.readiness.status,'REVIEW_REQUIRED');
  assert.equal(card.readiness.humanApprovalRequired,true);
});
test('reviewed actions are removed from outstanding; history is preserved', () => {
  const card = assembleDealCard({opportunity,sources:[],claims:[],events:[
    {id:'a',opportunityId:id,type:'action',title:'Loan tape',happenedAt:'2026-11-03T11:00:00Z',state:'open'},
    {id:'b',opportunityId:id,type:'action',title:'NDA',happenedAt:'2026-11-01T11:00:00Z',state:'done'},
  ]});
  assert.equal(card.actions.length,1);
  assert.equal(card.history.length,2);
});

test('reviewed hypotheses remain pending and cannot satisfy hard checklist fields', () => {
  const card=assembleDealCard({opportunity,sources:[source('a')],
    claims:[claim('c1','a','requestedAmount',50_000_000,{claimType:'hypothesis',status:'validated'})],
    events:[]});
  assert.equal(card.fields.requestedAmount.status,'pending_review');
  assert.ok(card.readiness.missing.includes('requestedAmount'));
  assert.equal(card.readiness.status,'REVIEW_REQUIRED');
});
