import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCandidateCommercialSemantics,
  classifyCandidateCommercialSemantics,
  extractFundingAmount,
} from './candidateCommercialSemantics.js';

const media = (companyName: string, title: string, sourceRef = 'src_finsiders_rss') => ({
  companyName,
  sourceRef,
  evidenceSummary: title,
  rawPayload: {
    title,
    transportSourceRef: 'google-news-rss',
    discoveryLane: 'funding',
  },
});

test('extractFundingAmount parses BRL millions and billions without FX inference', () => {
  assert.deepEqual(extractFundingAmount('CashGO levanta R$ 120 milhões'), {
    currency: 'BRL', amount: 120_000_000, raw: 'R$ 120 milhões',
  });
  assert.deepEqual(extractFundingAmount('UY3 busca R$ 3 bilhões'), {
    currency: 'BRL', amount: 3_000_000_000, raw: 'R$ 3 bilhões',
  });
  assert.deepEqual(extractFundingAmount('Stone capta US$ 467,5 milhões'), {
    currency: 'USD', amount: 467_500_000, raw: 'US$ 467,5 milhões',
  });
});

test('classifies explicit FIDC raise as a direct commercial funding trigger', () => {
  const result = classifyCandidateCommercialSemantics(media(
    'Open Co',
    'Open Co capta FIDC de R$ 50 milhões para expandir crédito a pequenas e médias empresas',
  ));
  assert.equal(result?.candidateRole, 'operating_company');
  assert.equal(result?.commercialQueue, true);
  assert.equal(result?.signalClass, 'direct_funding_trigger');
  assert.equal(result?.fundingInstrument, 'FIDC');
  assert.equal(result?.fundingAmount?.amount, 50_000_000);
  assert.equal(result?.automaticDecisionEligible, false);
  assert.equal(result?.version, 3);
});

test('classifies explicit funding search with credit context as a direct trigger', () => {
  const result = classifyCandidateCommercialSemantics(media(
    'UY3',
    'Fintech UY3 busca R$ 3 bilhões para apertar o passo no consignado privado',
    'src_neofeed_rss',
  ));
  assert.equal(result?.commercialQueue, true);
  assert.equal(result?.signalClass, 'direct_funding_trigger');
  assert.equal(result?.fundingAmount?.amount, 3_000_000_000);
});

test('classifies receivables funding raise as direct trigger', () => {
  const result = classifyCandidateCommercialSemantics(media(
    'CashGO',
    'CashGO levanta R$ 120 milhões e amplia aposta na antecipação de aluguel',
  ));
  assert.equal(result?.candidateRole, 'operating_company');
  assert.equal(result?.commercialQueue, true);
  assert.equal(result?.signalClass, 'direct_funding_trigger');
});

test('classifies explicit FIDC plan as commercial but distinct from completed funding', () => {
  const result = classifyCandidateCommercialSemantics(media(
    'Mitfokus',
    'Mitfokus levanta follow on com a Bossanova, para estender oferta e entrar em crédito; FIDC também está nos planos',
  ));
  assert.equal(result?.candidateRole, 'operating_company');
  assert.equal(result?.commercialQueue, true);
  assert.equal(result?.signalClass, 'funding_plan_trigger');
  assert.equal(result?.explicitFundingNeed, true);
});

test('keeps acquisition-led credit expansion out of direct funding queue', () => {
  const result = classifyCandidateCommercialSemantics(media(
    'PicPay',
    'PicPay compra BX Blue, fintech de consignado público',
  ));
  assert.equal(result?.candidateRole, 'operating_company');
  assert.equal(result?.commercialQueue, false);
  assert.equal(result?.signalClass, 'credit_expansion_trigger');
  assert.equal(result?.explicitFundingNeed, false);
});

test('routes third-party structuring activity to market intermediary', () => {
  const result = classifyCandidateCommercialSemantics(media(
    'VERT',
    'VERT estrutura R$ 1 bi em consignado privado para banco e fintech',
  ));
  assert.equal(result?.candidateRole, 'financial_intermediary');
  assert.equal(result?.commercialQueue, false);
  assert.equal(result?.signalClass, 'market_intermediary_activity');
});

test('does not interpret a commercial agreement with receivables volume as company funding', () => {
  const result = classifyCandidateCommercialSemantics(media(
    'CERC',
    'CERC fecha acordo com fintech Adiante e registra R$ 11 milhões em duplicatas eletrônicas, inspirada em nova regra do BC',
  ));
  assert.equal(result?.candidateRole, 'needs_classification');
  assert.equal(result?.commercialQueue, false);
  assert.equal(result?.signalClass, 'relevant_unclassified');
  assert.equal(result?.explicitFundingNeed, false);
  assert.equal(result?.fundingAmount?.amount, 11_000_000);
});

test('keeps an explicit financing closing as direct funding', () => {
  const result = classifyCandidateCommercialSemantics(media(
    'Stone',
    'Stone fecha empréstimo de R$ 2 bilhões para financiar expansão da carteira de crédito',
  ));
  assert.equal(result?.candidateRole, 'operating_company');
  assert.equal(result?.commercialQueue, true);
  assert.equal(result?.signalClass, 'direct_funding_trigger');
  assert.equal(result?.fundingInstrument, 'Emprestimo');
});

test('marks generic editorial subjects as non-entities', () => {
  const result = classifyCandidateCommercialSemantics(media(
    'Entrevista',
    'Entrevista - Fernando Fontes/CEO da CERC: Registro de duplicata eletrônica vai alavancar fintechs',
  ));
  assert.equal(result?.candidateRole, 'non_entity');
  assert.equal(result?.signalClass, 'editorial_noise');
  assert.equal(result?.confidence, 0.99);
});

test('does not classify non-media candidates', () => {
  const result = classifyCandidateCommercialSemantics({
    companyName: 'Empresa CVM',
    sourceRef: 'capital_market_event:debenture',
    evidenceSummary: 'Empresa CVM captou R$ 500 milhões',
    rawPayload: {},
  });
  assert.equal(result, null);
});

test('applyCandidateCommercialSemantics preserves evidence and never enables decision eligibility', () => {
  const rawPayload = applyCandidateCommercialSemantics({
    ...media('Open Co', 'Open Co capta FIDC de R$ 50 milhões para expandir crédito'),
    rawPayload: {
      title: 'Open Co capta FIDC de R$ 50 milhões para expandir crédito',
      transportSourceRef: 'google-news-rss',
      identity_review_status: 'pending',
      promotion_ready: false,
    },
  });
  assert.equal(rawPayload.candidate_role, 'operating_company');
  assert.equal(rawPayload.commercial_queue, true);
  assert.equal(rawPayload.identity_review_status, 'pending');
  assert.equal(rawPayload.promotion_ready, false);
  assert.equal(rawPayload.commercial_semantics_version, 3);
  assert.equal('decision_eligible' in rawPayload, false);
  const semantics = rawPayload.commercial_semantics as Record<string, unknown>;
  assert.equal(semantics.automaticDecisionEligible, false);
  assert.equal(semantics.version, 3);
});
