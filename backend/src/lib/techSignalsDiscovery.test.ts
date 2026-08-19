import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTechSignalsCandidates } from './techSignalsDiscovery.js';

test('discovers Brazil-only company candidates and carries DCM/FIDC hints into the shared candidate universe', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss><channel><item>
      <title>Tech Signals LatAm #15</title>
      <link>https://example.com/p/tech-signals-15</link>
      <pubDate>Wed, 19 Aug 2026 11:03:01 GMT</pubDate>
      <content:encoded><![CDATA[
        <p>Creditas, a São Paulo-based fintech, registered R$722.9 million in quarterly revenue and R$1.14 billion in originations.</p>
        <p>Segura, a São Paulo-based AI platform, saw a 23% increase in headcount over the past quarter, reaching 48 employees.</p>
        <p>Yuno, a Brazil-based payments-infrastructure startup, raised US$45 million in a Series B round.</p>
        <p>Ume, a Belo Horizonte-based digital-credit fintech, raised R$500 million through FIDCs.</p>
        <p>FAZ Cred, a São Paulo-based payroll lender, raised US$16 million through a new FIDC.</p>
        <p>Galgo, a Santiago-based vehicle-financing platform, received a strategic investment.</p>
      ]]></content:encoded>
    </item></channel></rss>`;

  const candidates = parseTechSignalsCandidates(xml);
  const names = candidates.map((candidate) => candidate.companyName);
  assert.ok(names.includes('Creditas'));
  assert.ok(names.includes('Segura'));
  assert.ok(names.includes('Yuno'));
  assert.ok(names.includes('Ume'));
  assert.ok(names.includes('FAZ Cred'));
  assert.equal(names.includes('Galgo'), false);

  const ume = candidates.find((candidate) => candidate.companyName === 'Ume');
  assert.equal(ume?.segment, 'Fintech');
  assert.equal(ume?.subsegment, 'Credit / Lending');
  assert.equal(ume?.targetStructure, 'FIDC');
  assert.equal(ume?.confidence, 0.82);
  assert.ok(Array.isArray(ume?.rawPayload.signalHints));
  assert.ok((ume?.rawPayload.signalHints as string[]).includes('fidc'));

  const segura = candidates.find((candidate) => candidate.companyName === 'Segura');
  assert.ok((segura?.rawPayload.signalHints as string[]).includes('headcount'));

  assert.equal(candidates.filter((candidate) => candidate.dedupeKey === 'name:ume').length, 1);
});
