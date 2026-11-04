import assert from 'node:assert/strict';
import test from 'node:test';
import { captureFromExternal, fetchFirefliesById, microsoftGraphLookup,
  projectExternalRecord, proposeAmountClaim } from './dealExternalSources.js';

test('Microsoft providers only generate fixed Graph paths with encoded IDs and narrow scopes', () => {
  assert.deepEqual(microsoftGraphLookup({provider:'outlook_email',externalId:'A/B?C'}), {
    path:'/me/messages/A%2FB%3FC?$select=id,subject,bodyPreview,receivedDateTime,lastModifiedDateTime,webLink,conversationId',
    scope:'Mail.Read',
  });
  assert.deepEqual(microsoftGraphLookup({provider:'outlook_calendar',externalId:'event-1'}).scope,'Calendars.Read');
  assert.deepEqual(microsoftGraphLookup({provider:'teams',externalId:'msg',chatId:'19:chat/id'}).scope,'Chat.Read');
  assert.deepEqual(microsoftGraphLookup({provider:'sharepoint',externalId:'item',driveId:'drive'}).scope,'Files.Read');
  assert.throws(()=>microsoftGraphLookup({provider:'teams',externalId:'msg'}),/chatId inválido/);
  assert.throws(()=>microsoftGraphLookup({provider:'sharepoint',externalId:'item'}),/driveId inválido/);
  assert.throws(()=>microsoftGraphLookup({provider:'outlook_email',externalId:'\n'}),/externalId inválido/);
});
test('email projection strips markup, rejects unsafe URL, keeps only bounded summary', () => {
  const value=projectExternalRecord('outlook_email',{id:'mail-1',subject:'Cliente',
    bodyPreview:'<div>Funding de R$ 50 milhões</div>',
    webLink:'javascript:alert(1)',receivedDateTime:'2026-11-03T10:00:00Z'});
  assert.equal(value.url,null);
  assert.equal(value.excerpt,'Funding de R$ 50 milhões');
  const cap=captureFromExternal(value,'d1');
  assert.equal(cap.mappingApproved,true);
  assert.equal(cap.claims?.[0]?.value,50_000_000);
  assert.equal(cap.claims?.[0]?.claimType,'hypothesis');
  assert.equal(cap.claims?.[0]?.confidence,0.35);
  assert.equal(cap.content?.includes('<div>'),false);
});
test('calendar and SharePoint metadata cannot become facts or amounts', () => {
  const calendar=projectExternalRecord('outlook_calendar', {
    id:'ev1',subject:'R$ 50 milhões captação',bodyPreview:'Pauta funding',
    start:{dateTime:'2026-11-03T10:00:00Z'},webLink:'https://outlook.office.com/calendar/item',
  });
  const folder=projectExternalRecord('sharepoint',{
    id:'doc',name:'loan tape.xlsx',eTag:'v2',lastModifiedDateTime:'2026-11-03T10:00:00Z',
    webUrl:'https://srm.sharepoint.com/sites/srm/doc',
  });
  assert.equal(captureFromExternal(calendar,'d1').claims?.length,0);
  assert.equal(captureFromExternal(folder,'d1').claims?.length,0);
  assert.equal(folder.url,'https://srm.sharepoint.com/sites/srm/doc');
});
test('ambiguous or missing funding context never produces amount claim', () => {
  assert.equal(proposeAmountClaim('A empresa teve receita R$ 50 milhões').length,0);
  assert.equal(proposeAmountClaim('Funding R$ 50 milhões ou R$ 60 milhões').length,0);
  assert.deepEqual(proposeAmountClaim('Linha de crédito de R$ 12,5 milhões')[0]?.value,12_500_000);
});
test('Fireflies adapter accesses exact meeting ID with key only in request header', async () => {
  let called = '';
  const fetcher: typeof fetch = async (input,init) => {
    called=String(input);
    assert.equal(init?.method,'POST');
    assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer secret-key');
    const req=JSON.parse(String(init?.body));
    assert.equal(req.variables.id,'ff-meeting-1');
    return new Response(JSON.stringify({data:{transcript:{
      id:'ff-meeting-1',title:'Funding',date:1783161600000,
      transcript_url:'https://app.fireflies.ai/view/ff-meeting-1',
      summary:{overview:'Funding de R$ 80 milhões',short_summary:''},
    }}}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const record=await fetchFirefliesById('ff-meeting-1','secret-key',fetcher);
  assert.equal(called,'https://api.fireflies.ai/graphql');
  assert.equal(record.provider,'fireflies');
  assert.equal(record.excerpt,'Funding de R$ 80 milhões');
  assert.equal(captureFromExternal(record,'deal-1').claims?.[0]?.claimType,'hypothesis');
});
test('Fireflies response fails closed on different ID and GraphQL errors', async () => {
  const fake = (value:unknown):typeof fetch => async()=>new Response(JSON.stringify(value),{status:200});
  await assert.rejects(()=>fetchFirefliesById('A','key',fake({data:{transcript:{id:'B'}}})),/não localizada/);
  await assert.rejects(()=>fetchFirefliesById('A','key',fake({errors:[{message:'boom'}]})),/GraphQL/);
  await assert.rejects(()=>fetchFirefliesById('A','',fake({})),/não configurada/);
});
