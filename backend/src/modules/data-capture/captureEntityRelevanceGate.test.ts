import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanySeed, CompanySignal, MonitoringOutput } from '../../types/platform.js';
import type { CaptureEngineResult } from './types.js';
import { assessOutputEntityRelevance, filterCaptureResultsForEntityRelevance } from './captureEntityRelevanceGate.js';

const company = {
  id: '11111111-1111-4111-8111-111111111111',
  legalName: 'Creditas Soluções Financeiras Ltda.',
  tradeName: 'Creditas',
  cnpj: '12.345.678/0001-99',
  website: 'https://creditas.com',
  geography: 'Brasil',
  segment: 'Fintech',
  subsegment: 'Crédito',
  companyType: 'fintech',
  stage: 'growth',
  creditProduct: 'crédito',
  receivables: [],
  currentFundingStructure: '',
  description: '',
  signals: [],
  monitoring: { status: 'active', lastRunAt: '', outputs24h: 0, triggers24h: 0, websiteChanges: [], feedHighlights: [] },
  enrichment: {
    governanceMaturity: 'medium', underwritingMaturity: 'medium', operationalMaturity: 'medium', riskModelMaturity: 'medium',
    unitEconomicsQuality: 'mixed', spreadVsFundingQuality: 'neutral', concentrationRisk: 'medium', delinquencySignal: 'low',
    sourceConfidence: 0.8, sourceNotes: [],
  },
  sourceRecords: [], marketMapPeers: [], activities: [],
} satisfies CompanySeed;

const output = (overrides: Partial<MonitoringOutput> & Pick<MonitoringOutput, 'id' | 'sourceId'>): MonitoringOutput => ({
  companyId: company.id,
  title: 'Fonte monitorada · Creditas',
  summary: 'Resumo monitorado.',
  collectedAt: new Date().toISOString(),
  confidenceScore: 0.9,
  connectorStatus: 'real',
  normalizedPayload: {},
  ...overrides,
});

const signal = (id: string, sourceId: string | undefined, note: string, evidencePayload: Record<string, unknown> = {}): CompanySignal => ({
  id,
  companyId: company.id,
  sourceId,
  signalType: 'vc_portfolio_signal',
  signalStrength: 80,
  confidenceScore: 0.85,
  evidencePayload: { note, ...evidencePayload },
  observedVsInferred: 'observed',
  createdAt: new Date().toISOString(),
});

const resultFor = (outputs: MonitoringOutput[], signals: CompanySignal[]): CaptureEngineResult => ({
  run: {
    scopeType: 'company',
    triggerType: 'cron',
    companyId: company.id,
    status: 'completed',
    itemsCollected: outputs.length,
    outputsWritten: outputs.length,
    signalsWritten: signals.length,
    enrichmentsWritten: 0,
  },
  documents: [],
  outputs,
  signals,
  enrichments: [],
  treatmentResults: [],
});

test('mixed RSS keeps the company item but blocks unrelated native and treatment signals', () => {
  const rss = output({
    id: 'rss-mixed',
    sourceId: 'rss-source',
    summary: 'Creditas conclui rodada de US$ 108 milhões | Dia do Crédito Consciente promove rodada em Olinda',
    normalizedPayload: {
      sourceCode: 'src_vc_portfolio_change_rss',
      sourceCategory: 'vc_portfolio',
      sourceUrl: 'https://news.google.com/rss/search?q=Creditas',
      items: [
        { title: 'Creditas conclui rodada de US$ 108 milhões com entrada do Andbank', description: 'Nova rodada da Creditas.' },
        { title: 'Dia do Crédito Consciente promove rodada em Olinda', description: 'Evento municipal para empreendedores.' },
      ],
    },
  });

  const relevant = signal('sig-creditas', 'rss-source', 'Creditas conclui rodada de US$ 108 milhões com entrada do Andbank.');
  const unrelated = signal('sig-olinda', 'rss-source', 'Dia do Crédito Consciente promove rodada de crédito para empreendedores em Olinda.');
  const pollutedTreatment = signal('sig-treatment', 'rss-source', 'Fit potencial para DCM: VC Portfolio · Creditas', {
    treatmentVersion: 'capture_treatment_v2',
    outputId: 'rss-mixed',
    keywords: ['debenture'],
    summary: rss.summary,
  });

  const filtered = filterCaptureResultsForEntityRelevance([resultFor([rss], [relevant, unrelated, pollutedTreatment])], [company]);
  assert.equal(filtered.results[0]?.outputs.length, 1);
  assert.deepEqual(filtered.results[0]?.signals.map((item) => item.id), ['sig-creditas']);
  assert.equal(filtered.diagnostics.blockedSignals, 2);
});

test('RSS without explicit company evidence is blocked even when the generated wrapper title contains the company', () => {
  const rss = output({
    id: 'rss-unrelated',
    sourceId: 'rss-source',
    title: 'VC PE Portfolio Movement RSS · Creditas',
    summary: 'Loft já vale R$ 1,5 bi | Startup de clínicas capta R$ 45 mi',
    normalizedPayload: {
      sourceCode: 'src_vc_pe_portfolio_rss',
      sourceCategory: 'vc_portfolio',
      sourceUrl: 'https://news.google.com/rss/search?q=Creditas+venture+capital',
      items: [
        { title: 'Loft já vale R$ 1,5 bi', description: 'Mercado imobiliário.' },
        { title: 'Startup de clínicas capta R$ 45 mi', description: 'Rodada de outra empresa.' },
      ],
    },
  });

  const assessment = assessOutputEntityRelevance(company, rss);
  assert.equal(assessment.eligible, false);
  assert.equal(assessment.reason, 'aggregator_entity_mismatch');

  const filtered = filterCaptureResultsForEntityRelevance([resultFor([rss], [signal('sig-1', 'rss-source', rss.summary)])], [company]);
  assert.equal(filtered.results[0]?.outputs.length, 0);
  assert.equal(filtered.results[0]?.signals.length, 0);
});

test('macro BCB evidence is retained outside the company decision layer', () => {
  const macro = output({
    id: 'macro-bcb',
    sourceId: 'bcb-source',
    summary: 'Saldo de crédito e taxa média do sistema financeiro.',
    normalizedPayload: {
      sourceCode: 'src_bcb_sgs',
      sourceCategory: 'macro_context',
      sourceUrl: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.20539/dados',
    },
  });

  const assessment = assessOutputEntityRelevance(company, macro);
  assert.equal(assessment.eligible, false);
  assert.equal(assessment.reason, 'market_context_not_company_evidence');
});

test('first-party company evidence remains eligible without repeating the company name in every heading', () => {
  const website = output({
    id: 'website',
    sourceId: 'website-source',
    summary: 'Antecipação de recebíveis, novos produtos e expansão da carteira.',
    normalizedPayload: {
      sourceCode: 'src_company_website',
      sourceCategory: 'company_site',
      sourceUrl: 'https://www.creditas.com/produtos',
    },
  });

  const assessment = assessOutputEntityRelevance(company, website);
  assert.equal(assessment.eligible, true);
  assert.equal(assessment.reason, 'company_bound_source');
  assert.equal(assessment.score, 100);
});
