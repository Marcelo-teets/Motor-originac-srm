import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRankingRow } from './ranking.js';
import { buildThesisOutput } from './thesis.js';

test('blocking public compliance evidence caps ranking below commercial priority', () => {
  const row = buildRankingRow({
    companyId: 'company-1',
    companyName: 'Empresa Teste',
    qualification: {
      qualification_score_total: 92,
      trigger_strength_score: 95,
      source_confidence_score: 0.96,
      suggested_structure_type: 'FIDC',
      evidence_payload: { publicEvidence: { opportunityScore: 30, riskPenalty: 45, blockingRiskCount: 1, riskLevel: 'blocking' } },
    } as any,
    lead: { leadScore: 90, bucket: 'immediate_priority' } as any,
    patterns: [],
  });
  assert.equal(row.rankingScore <= 54, true);
});

test('public contract evidence becomes an explicit thesis and structure driver', () => {
  const thesis = buildThesisOutput({
    tradeName: 'Empresa Teste',
    creditProduct: 'capital de giro',
    receivables: ['Duplicatas'],
  } as any, {
    suggested_structure_type: 'Warehouse',
    fit_fidc: true,
    confidence_score: 0.8,
    evidence_payload: {
      publicEvidence: {
        publicSignalCount: 1,
        recommendedStructures: ['FIDC de recebíveis públicos / cessão de contratos'],
        whyNow: ['Contrato público identificado.'],
        dueDiligenceActions: ['Validar cessibilidade.'],
        strongestOpportunity: { summary: 'Contrato público de longo prazo', amount: 5_000_000 },
      },
    },
  } as any, []);
  assert.equal(thesis.structureType, 'FIDC de recebíveis públicos / cessão de contratos');
  assert.match(thesis.summary, /Contrato público/);
  assert.match(thesis.marketMapSummary, /Validar cessibilidade/);
});
