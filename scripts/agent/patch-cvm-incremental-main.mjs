import fs from 'node:fs';

const connectorPath = 'backend/src/modules/capital-markets/cvmCapitalMarketConnector.ts';
let connector = fs.readFileSync(connectorPath, 'utf8');

const identityBefore = `  const contentHash = stableHash(JSON.stringify(input.row));
  const recordKey = stableHash([
    input.datasetCode,
    input.resource.name,
    input.fileName,
    offerId,
    securityCode,
    issuerCnpj,
    fundCnpj,
    referenceDate,
    contentHash,
  ].join('|'));`;
const identityAfter = `  const contentHash = stableHash(JSON.stringify(input.row));
  const normalizedIssuer = normalizeKey(issuerName ?? fundName ?? '');
  const naturalIdentity = [
    offerId,
    securityCode,
    issuerCnpj ?? fundCnpj ?? normalizedIssuer,
    series,
    referenceDate ?? eventDate,
    instrumentType,
  ].filter(Boolean).join('|');
  const recordKey = stableHash([
    input.datasetCode,
    naturalIdentity || \`${'${input.resource.name}'}|${'${input.fileName}'}|${'${contentHash}'}\`,
  ].join('|'));`;
if (!connector.includes(identityBefore)) throw new Error('CVM identity anchor not found');
connector = connector.replace(identityBefore, identityAfter);

const eventBefore = `    event: {
      dataset_code: input.datasetCode,
      source_code: definition.sourceCode,
      record_key: recordKey,
      event_type: definition.eventType,`;
const eventAfter = `    event: {
      dataset_code: input.datasetCode,
      source_code: definition.sourceCode,
      record_key: recordKey,
      content_hash: contentHash,
      event_type: definition.eventType,`;
if (!connector.includes(eventBefore)) throw new Error('CVM event content hash anchor not found');
connector = connector.replace(eventBefore, eventAfter);
fs.writeFileSync(connectorPath, connector);

const testPath = 'backend/src/modules/capital-markets/cvmCapitalMarketConnector.test.ts';
let tests = fs.readFileSync(testPath, 'utf8');
if (!tests.includes("natural record identity remains stable when mutable fields change")) {
  tests += `

test('natural record identity remains stable when mutable fields change', () => {
  const base = {
    datasetCode: 'cvm_offers' as const,
    resource: { name: 'oferta_distribuicao.zip', url: 'https://dados.cvm.gov.br/oferta.zip' },
    fileName: 'oferta_distribuicao.csv',
    observedAt: '2026-07-14T12:00:00.000Z',
  };
  const first = normalizeCapitalMarketRecord({
    ...base,
    row: {
      CNPJ_Emissor: '12.345.678/0001-90',
      Nome_Emissor: 'Empresa Teste S.A.',
      Tipo_Ativo: 'Debêntures',
      Valor_Total: '250.000.000,00',
      Data_Registro_Oferta: '14/07/2026',
      Numero_Registro_Oferta: 'CVM-2026-001',
      Situacao_Oferta: 'Em análise',
    },
  });
  const updated = normalizeCapitalMarketRecord({
    ...base,
    observedAt: '2026-07-15T12:00:00.000Z',
    row: {
      CNPJ_Emissor: '12.345.678/0001-90',
      Nome_Emissor: 'Empresa Teste S.A.',
      Tipo_Ativo: 'Debêntures',
      Valor_Total: '300.000.000,00',
      Data_Registro_Oferta: '14/07/2026',
      Numero_Registro_Oferta: 'CVM-2026-001',
      Situacao_Oferta: 'Registrada',
    },
  });

  assert.equal(first.event.record_key, updated.event.record_key);
  assert.notEqual(first.event.content_hash, updated.event.content_hash);
  assert.equal(updated.event.volume, 300_000_000);
});
`;
}
fs.writeFileSync(testPath, tests);
