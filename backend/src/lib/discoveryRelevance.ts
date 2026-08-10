import type { SearchProfile } from '../types/platform.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';

export type DiscoveryRelevanceResult = {
  hits: DiscoverySourceHit[];
  rejected: number;
  accepted: number;
};

const normalize = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const evidenceText = (hit: DiscoverySourceHit) => normalize([
  hit.companyName,
  hit.evidenceSummary,
  typeof hit.rawPayload.title === 'string' ? hit.rawPayload.title : '',
  typeof hit.rawPayload.description === 'string' ? hit.rawPayload.description : '',
].join(' '));

const financeSignal = /\b(fidcs?|securitiz\w*|recebive\w*|antecip\w*|credito\w*|financi\w*|funding|capta\w*|levanta\w*|emprest\w*|divida\w*|debent\w*|nota comercial|mercado de capitais|capital de giro|carteira de credito|carteira de recebiveis|origina\w*|duplicata\w*|consignad\w*|parcelamento|bnpl|lending|financing|warehouse)\b/i;
const fidcSignal = /\b(fidcs?|securitiz\w*|recebive\w*|antecip\w*|carteira\w*|origina\w*|duplicata\w*|credito\w*|financi\w*|capital de giro|consignad\w*|parcelamento|bnpl)\b/i;
const dcmSignal = /\b(debent\w*|divida\w*|emiss\w*|emite|emitiu|capta\w*|funding|mercado de capitais|nota comercial|emprest\w*|alongamento|passivo\w*|bond\w*)\b/i;
const warehouseSignal = /\b(warehouse|funding|carteira\w*|credito\w*|recebive\w*|antecip\w*|origina\w*|capital de giro|financi\w*)\b/i;
const criSignal = /\b(cri|securitiz\w*|recebiveis imobiliarios|credito imobiliario|imobiliari\w*)\b/i;
const craSignal = /\b(cra|securitiz\w*|recebiveis do agro|recebiveis agricolas|agronegocio|credito rural|insumos rurais)\b/i;

const explicitPortfolioIntent = /\b(portfolio|portf[oó]lio|venture|vc|investida|investidas|startup|startups|tech-backed)\b/i;

const expectedSignal = (profile: SearchProfile) => {
  const target = normalize(profile.targetStructure);
  if (target.includes('fidc')) return { id: 'fidc', pattern: fidcSignal };
  if (target.includes('debent') || target.includes('dcm') || target.includes('nota comercial')) return { id: 'dcm', pattern: dcmSignal };
  if (target.includes('warehouse')) return { id: 'warehouse', pattern: warehouseSignal };
  if (target.includes('cri')) return { id: 'cri', pattern: criSignal };
  if (target.includes('cra')) return { id: 'cra', pattern: craSignal };
  return { id: 'credit', pattern: financeSignal };
};

const isPortfolioHit = (hit: DiscoverySourceHit) => {
  const origin = normalize(hit.rawPayload.origin);
  return hit.sourceRef.startsWith('vc-portfolio:') || origin === 'vc_portfolio_page';
};

const quickQuery = (profile: SearchProfile) => typeof profile.profilePayload?.userQuery === 'string'
  ? profile.profilePayload.userQuery
  : '';

const annotate = (
  hit: DiscoverySourceHit,
  accepted: boolean,
  rule: string,
  expected: string,
): DiscoverySourceHit => ({
  ...hit,
  rawPayload: {
    ...hit.rawPayload,
    relevanceGate: {
      version: 'v10',
      accepted,
      rule,
      expected,
    },
  },
});

/**
 * Discovery is intentionally high-recall. This gate runs after entity
 * normalization and before persistence so that broad search lanes do not turn
 * unrelated news about a real company into an origination candidate.
 *
 * It does not qualify credit, score the company or infer funding need. It only
 * asks whether the observed evidence is materially related to the search's
 * credit/structure thesis. Final identity and thesis still require review.
 */
export const filterDiscoveryHitsByProfileRelevance = (
  profile: SearchProfile,
  hits: DiscoverySourceHit[],
): DiscoveryRelevanceResult => {
  const expected = expectedSignal(profile);
  const query = quickQuery(profile);
  const allowPortfolioUniverse = explicitPortfolioIntent.test(query);
  const accepted: DiscoverySourceHit[] = [];
  let rejected = 0;

  for (const hit of hits) {
    if (isPortfolioHit(hit) && allowPortfolioUniverse) {
      accepted.push(annotate(hit, true, 'explicit_portfolio_universe_intent', expected.id));
      continue;
    }

    const evidence = evidenceText(hit);
    if (expected.pattern.test(evidence)) {
      accepted.push(annotate(hit, true, `matched_${expected.id}_evidence`, expected.id));
      continue;
    }

    // A query may not mention an explicit structure but still describe a
    // funding/credit thesis. In that case a strong finance signal is enough to
    // preserve recall, but pure growth/product/AI news remains excluded.
    if (!normalize(profile.targetStructure) && financeSignal.test(evidence)) {
      accepted.push(annotate(hit, true, 'matched_general_finance_evidence', expected.id));
      continue;
    }

    rejected += 1;
  }

  return {
    hits: accepted,
    rejected,
    accepted: accepted.length,
  };
};
