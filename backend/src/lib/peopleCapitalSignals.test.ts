import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('turns newsletter headcount and funding text into temporal and relationship observations', async () => {
  const originalFetch = globalThis.fetch;
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss><channel><item>
      <title>Tech Signals LatAm #15</title>
      <link>https://example.com/p/tech-signals-15</link>
      <pubDate>Wed, 19 Aug 2026 12:00:00 GMT</pubDate>
      <content:encoded><![CDATA[
        <h2>Team Expansion</h2>
        <p>Segura saw a ~20% headcount growth over the past month, reaching a total of 120 employees.</p>
        <h2>Funding Rounds</h2>
        <p>Yuno raised US$45M in a Series B led by Valor Capital with participation from Monashees and Kaszek.</p>
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
    assert.equal(segura.headcount?.total, 120);
    assert.equal(segura.headcount?.growthPct, 20);
    assert.equal(segura.headcount?.inferredPreviousTotal, 100);
    assert.equal(segura.headcount?.periodLabel, 'month');
    assert.ok(segura.signals.some((signal) => signal.type === 'headcount_acceleration'));

    const yuno = await captureTechSignalsLatam({
      companyName: 'Yuno',
      feedUrl: 'https://example.com/feed',
      collectedAt: '2026-08-19T12:00:00.000Z',
    });
    assert.equal(yuno.matched, true);
    assert.ok(yuno.investors.some((investor) => investor.investorName === 'Valor Capital' && investor.isLead));
    assert.ok(yuno.investors.some((investor) => investor.investorName === 'Monashees'));
    assert.ok(yuno.investors.some((investor) => investor.investorName === 'Kaszek'));
    assert.equal(yuno.investors[0]?.roundStage, 'Series B');
    assert.equal(yuno.investors[0]?.roundAmount, 45_000_000);
    assert.equal(yuno.investors[0]?.roundCurrency, 'USD');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
