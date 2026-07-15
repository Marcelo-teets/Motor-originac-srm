import fs from 'node:fs';

const path = 'backend/src/modules/capital-markets/cvmCapitalMarketConnector.ts';
let source = fs.readFileSync(path, 'utf8');

const volumeBefore = "'Valor Total Oferta', 'VL Total Oferta', 'Valor Oferta'";
const volumeAfter = "'Valor Total', 'Valor Total Oferta', 'VL Total Oferta', 'Valor Oferta'";
if (!source.includes(volumeBefore)) throw new Error('Volume alias anchor not found');
source = source.replace(volumeBefore, volumeAfter);

const keyBefore = `  const contentHash = stableHash(JSON.stringify(input.row));
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
const keyAfter = `  const contentHash = stableHash(JSON.stringify(input.row));
  const naturalIdentity = [offerId, securityCode, issuerCnpj, fundCnpj, series, referenceDate, eventDate]
    .filter(Boolean)
    .join('|');
  const recordKey = stableHash([
    input.datasetCode,
    input.resource.name,
    input.fileName,
    naturalIdentity || contentHash,
  ].join('|'));`;
if (!source.includes(keyBefore)) throw new Error('Record key anchor not found');
source = source.replace(keyBefore, keyAfter);

fs.writeFileSync(path, source);
