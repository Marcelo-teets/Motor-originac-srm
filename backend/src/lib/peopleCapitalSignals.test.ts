import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureCompanyCareers,
  captureTechSignalsLatam,
  classifyRoleFamily,
  extractJobOpenings,
  inferSeniority,
} from './peopleCapitalSignals.js';

test('classifies DCM and credit role families without collapsing them into generic finance', () => {
  assert.equal(classifyRoleFamily('Head of Capital Markets'), 'capital_markets');
  assert.equal(classifyRoleFamily('Senior Credit Risk Analyst'), 'risk');
  assert.equal(classifyRoleFamily('Treasury Manager'), 'treasury');
  assert.equal(classifyRoleFamily('Underwriting Specialist'), 'underwriting');
  assert.equal(inferSeniority('Head of Capital Markets'), 'executive');
  assert.equal(inferSeniority('Senior Credit Risk Analyst'), 'senior');
});

test('extracts structured JobPosting records with DCM relevance', () => {
  const html = `
    <html><head>
      <script type="application/ld+json">
      {
        "@context":"https://schema.org",
        "@type":"JobPosting",
        "identifier":{"value":"cm-123"},
        "title":"Capital Markets Manager",
        "datePosted":"2026-08-18T12:00:00Z",
        "employmentType":"FULL_TIME",
        "url":"https://example.com/jobs/cm-123",
        "jobLocation":{"address":{"addressLocality":"São Paulo","addressRegion":"SP","addressCountry":"BR"}}
      }
      </script>
    </head><body></body></html>`;

  const jobs = extractJobOpenings(html, 'https://example.com/careers');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.externalJobId, 'cm-123');
  assert.equal(jobs[0]?.roleFamily, 'capital_markets');
  assert.equal(jobs[0]?.seniority, 'manager');
  assert.equal(jobs[0]?.dcmRelevanceScore, 100);
  assert.equal(jobs[0]?.location, 'São Paulo, SP, BR');
});

test('does not accept a generic homepage 200 as an authoritative empty careers page', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(`
    <html><head><title>Example Company</title></head>
    <body><h1>Welcome to Example Company</h1><a href="/careers">Careers</a></body></html>
  `, { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;

  try {
    const capture = await captureCompanyCareers({
      companyName: 'Example Company',
      website: 'https://example.com',
      collectedAt: '2026-08-19T12:00:00.000Z',
    });
    assert.equal(capture.connectorStatus, 'partial');
    assert.equal(capture.matched, false);
    assert.equal(capture.jobs.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('accepts an explicit careers page with no openings as a real zero-job observation', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(`
    <html><head><title>Careers — Example Company</title></head>
    <body><h1>Join our team</h1><p>We have no open positions right now.</p></body></html>
  `, { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch;

  try {
    const capture = await captureCompanyCareers({
      companyName: 'Example Company',
      website: 'https://example.com',
      collectedAt: '2026-08-19T12:00:00.000Z',
    });
    assert.equal(capture.connectorStatus, 'real');
    assert.equal(capture.matched, true);
    assert.equal(capture.jobs.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('turns Tech Signals LatAm #15 semantics into isolated headcount, capital and investor observations', async () => {
  const originalFetch = globalThis.fetch;
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss><channel><item>
      <title>Tech Signals LatAm #15</title>
      <link>https://example.com/p/tech-signals-15</link>
      <pubDate>Wed, 19 Aug 2026 11:03:01 GMT</pubDate>
      <content:encoded><![CDATA[
        <h2>Team Expansion</h2>
        <p>Segura, a São Paulo-based AI platform, saw a 23% increase in headcount over the past quarter, reaching a total of 48 employees.</p>
        <h2>Funding Rounds</h2>
        <p>Yuno, a Brazil-based payments-infrastructure startup, raised US$45 million in a Series B round led by Global PayTech Ventures. Andreessen Horowitz, Tiger Global, Kaszek, Monashees, QuantumLight Capital, Endeavor Catalyst, Rasmal Ventures, Further Ventures and GrowthX Capital also participated.</p>
        <h2>Debt Rounds</h2>
        <p>Kesh, a São Paulo-based fintech and HRtech platform, raised R$550 million in a Seed round combining equity and debt financing. Leste led the investment alongside BR Angels and Across Capital.</p>
        <p>Ume, a Belo Horizonte-based digital-credit fintech, raised R$500 million through FIDCs. Itaú, Bradesco, XP (Augme), Milenio, Verde and Credit Saison participated in the oversubscribed operation.</p>
        <p>FAZ Cred, a São Paulo-based payroll lender, raised US$16 million through a new FIDC. The vehicle targets the health and education sectors, with Patrimonial serving as principal investor.</p>
      ]]></content:encoded>
    </item></channel></rss>`;

  globalThis.fetch = (async () => new Response(rss, {
    status: 200,
    headers: { 'content-type': 'application/rss+xml' },
  })) as typeof fetch;

  try {
    const segura = await captureTechSignalsLatam({
      companyName: 'Segura',
      feedUrl: 'https://example.com/feed',
      collectedAt: '2026-08-19T12:00:00.000Z',
    });
    assert.equal(segura.matched, true);
    assert.equal(segura.headcount?.total, 48);
    assert.equal(segura.headcount?.growthPct, 23);
    assert.equal(segura.headcount?.inferredPreviousTotal, 39);
    assert.equal(segura.headcount?.periodLabel, 'quarter');
    assert.ok(segura.signals.some((signal) => signal.type === 'headcount_acceleration'));

    const yuno = await captureTechSignalsLatam({
      companyName: 'Yuno',
      feedUrl: 'https://example.com/feed',
      collectedAt: '2026-08-19T12:00:00.000Z',
    });
    assert.equal(yuno.matched, true);
    assert.equal(yuno.investors.length, 10);
    assert.ok(yuno.investors.some((investor) => investor.investorName === 'Global PayTech Ventures' && investor.isLead));
    assert.ok(yuno.investors.some((investor) => investor.investorName === 'Andreessen Horowitz'));
    assert.ok(yuno.investors.some((investor) => investor.investorName === 'Tiger Global'));
    assert.ok(yuno.investors.some((investor) => investor.investorName === 'Kaszek'));
    assert.ok(yuno.investors.some((investor) => investor.investorName === 'Monashees'));
    assert.ok(yuno.investors.some((investor) => investor.investorName === 'GrowthX Capital'));
    assert.equal(yuno.investors[0]?.roundStage, 'Series B');
    assert.equal(yuno.investors[0]?.roundAmount, 45_000_000);
    assert.equal(yuno.investors[0]?.roundCurrency, 'USD');
    assert.equal(yuno.investors.some((investor) => investor.investorName === 'Itaú'), false);
    assert.equal(yuno.investors.some((investor) => investor.investorName === 'Patrimonial'), false);

    const kesh = await captureTechSignalsLatam({
      companyName: 'Kesh',
      feedUrl: 'https://example.com/feed',
      collectedAt: '2026-08-19T12:00:00.000Z',
    });
    assert.ok(kesh.signals.some((signal) => signal.type === 'structured_debt_funding'));
    assert.ok(kesh.investors.some((investor) => investor.investorName === 'Leste' && investor.isLead));

    const ume = await captureTechSignalsLatam({
      companyName: 'Ume',
      feedUrl: 'https://example.com/feed',
      collectedAt: '2026-08-19T12:00:00.000Z',
    });
    assert.ok(ume.signals.some((signal) => signal.type === 'fidc_funding_event'));
    assert.ok(ume.investors.some((investor) => investor.investorName === 'Itaú'));
    assert.ok(ume.investors.some((investor) => investor.investorName === 'Bradesco'));
    assert.ok(ume.investors.some((investor) => investor.investorName === 'Credit Saison'));

    const fazCred = await captureTechSignalsLatam({
      companyName: 'FAZ Cred',
      feedUrl: 'https://example.com/feed',
      collectedAt: '2026-08-19T12:00:00.000Z',
    });
    assert.ok(fazCred.signals.some((signal) => signal.type === 'fidc_funding_event'));
    assert.ok(fazCred.investors.some((investor) => investor.investorName === 'Patrimonial' && investor.isLead));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
