import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprintOfRecord, MAX_WATCHES_PER_RUN, normalizeWatchRequest,
  safeWatchFailureCode, sourceHasChanged } from './dealSourceWatch.js';

test('exact source monitor requires explicit consent and fixed Microsoft permissions',()=>{
  assert.throws(()=>normalizeWatchRequest({
    provider:'outlook_email',externalId:'email-1',confirmed:false,
  }),/Consentimento explícito/);
  const approved=normalizeWatchRequest({
    provider:'outlook_email',externalId:'e-1',confirmed:true,
  });
  assert.equal(approved.context_id,'');
  assert.equal(approved.lookup.scope,'Mail.Read');
  assert.ok(approved.lookup.path.startsWith('/me/messages/'));
  assert.throws(()=>normalizeWatchRequest({
    provider:'sharepoint',externalId:'doc',confirmed:true,
  }),/driveId inválido/);
  assert.throws(()=>normalizeWatchRequest({
    provider:'outlook_email',externalId:'e1',chatId:'123',confirmed:true,
  }),/Contexto adicional/);
  assert.equal(normalizeWatchRequest({
    provider:'teams',externalId:'msg',chatId:'chat',confirmed:true,
  }).lookup.scope,'Chat.Read');
});
test('monitoring compares durable versions and cannot auto-map a deal',()=>{
  const record={provider:'outlook_email' as const,externalId:'msg',
    title:'Conversas',occurredAt:'2026-11-03T13:00:00Z',
    url:'https://outlook.office.com/mail/1',excerpt:'Confidencial',resourceFingerprint:'v1'};
  const fingerprint=fingerprintOfRecord(record);
  assert.match(fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(sourceHasChanged(null,record),true);
  assert.equal(sourceHasChanged(fingerprint,record),false);
  assert.equal(sourceHasChanged(fingerprint,{...record,resourceFingerprint:'v2'}),true);
  assert.equal(JSON.stringify({fingerprint}).includes(record.excerpt),false);
});
test('watch budget is bounded and errors are redacted',()=>{
  assert.ok(MAX_WATCHES_PER_RUN>0&&MAX_WATCHES_PER_RUN<=10);
  assert.equal(safeWatchFailureCode({statusCode:403,message:'Secret: key'}),'GRAPH_HTTP_403');
  assert.equal(safeWatchFailureCode(new Error('Personal data')),'SOURCE_FETCH_FAILED');
});
