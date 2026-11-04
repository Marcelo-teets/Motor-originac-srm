import assert from 'node:assert/strict';
import test from 'node:test';
import { mustReviewIntakeResolution, normalizeSourceIntake } from './dealSourceInbox.js';

test('intake retains only whitelisted reference metadata and stable fingerprint, not credentials', () => {
  const a=normalizeSourceIntake({
    provider:'outlook_email',externalId:'message-1',title:'Reunião DCM',
    sourceRef:'https://outlook.office.com/mail/id?token=secret#login',occurredAt:'2026-11-03T15:00:00-03:00',
  });
  const b=normalizeSourceIntake({
    provider:'outlook_email',externalId:'message-1',title:'Reunião DCM',
    sourceRef:'https://outlook.office.com/mail/id?token=another#different',occurredAt:'2026-11-03T18:00:00Z',
  });
  assert.deepEqual(a,b);
  assert.equal(a.source_ref,'https://outlook.office.com/mail/id');
  assert.equal(JSON.stringify(a).includes('secret'),false);
  assert.match(a.content_sha256,/^[a-f0-9]{64}$/);
  assert.equal(a.suggested_opportunity_id,null);
});
test('source versions hash differently, without relying on wall-clock time', () => {
  const base={provider:'fireflies' as const,externalId:'meeting-1',title:'Operação'};
  const one=normalizeSourceIntake({...base,fingerprint:'etag-1'});
  assert.deepEqual(one,normalizeSourceIntake({...base,fingerprint:'etag-1'}));
  const two=normalizeSourceIntake({...base,fingerprint:'etag-2'});
  assert.notEqual(one.content_sha256,two.content_sha256);
});
test('provider, ids, URLs, timestamps and suggested deals are validated', () => {
  const base={provider:'teams' as const,externalId:'msg1',title:'Introdução'};
  assert.throws(()=>normalizeSourceIntake({...base,provider:'other' as any}),/Provedor/);
  assert.throws(()=>normalizeSourceIntake({...base,externalId:'\n'}),/Identificador/);
  assert.throws(()=>normalizeSourceIntake({...base,sourceRef:'http://example.com'}),/HTTPS/);
  assert.throws(()=>normalizeSourceIntake({...base,sourceRef:'https://name:pass@example.com'}),/HTTPS/);
  assert.throws(()=>normalizeSourceIntake({...base,occurredAt:'unknown'}),/Data/);
  assert.throws(()=>normalizeSourceIntake({...base,suggestedDealId:'company-name'}),/Oportunidade/);
});
test('only explicit, documented human decisions are accepted', () => {
  assert.ok(mustReviewIntakeResolution('pending','link','Checado com o originador','deal-1'));
  assert.ok(mustReviewIntakeResolution('pending','ignore','Não pertence a nenhuma operação'));
  assert.throws(()=>mustReviewIntakeResolution('linked','link','Mesmo motivo','deal-1'),/já foi decidido/);
  assert.throws(()=>mustReviewIntakeResolution('pending','link','Curto','deal-1'),/Justificativa/);
  assert.throws(()=>mustReviewIntakeResolution('pending','link','Motivo suficiente'),/Selecione/);
  assert.throws(()=>mustReviewIntakeResolution('pending','ignore','Motivo suficiente','deal-1'),/Descarte/);
});
