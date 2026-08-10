import type { SearchProfile } from '../types/platform.js';
import type { DiscoverySourceHit } from './discoveryCapture.js';

export type DiscoveryRelevanceResult = {
  hits: DiscoverySourceHit[];
  rejected: number;
  accepted: number;
  specificIntentRejected: number;
};

type SpecificIntentSpec = {
  id: 'consignado_privado' | 'consignado' | 'embedded_finance' | 'medical_financing' | 'agro_credit' | 'pme_credit';
  pattern: RegExp;
  requiresFinanceContext?: boolean;
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

const consignadoSignal = /\b(consignad\w*|credito do trabalhador|credito ao trabalhador|payroll(?: lending| loan)?|emprestimo em folha|credito em folha|desconto em folha)\b/i;
const consignadoPrivadoSignal = /\b(consignad\w*\s+privad\w*|privad\w*\s+consignad\w*|credito do trabalhador|credito ao trabalhador|credito consignado clt|consignad\w*\s+clt|clt\s+consignad\w*|payroll(?: lending| loan)?|emprestimo em folha para (?:empregados|trabalhadores|clt)|credito em folha para (?:empregados|trabalhadores|clt))\b/i;
const embeddedFinanceSignal = /\b(embedded finance|financas embutidas|credito embutido|credito integrado|banking as a service|baas|credit as a service|lending as a service|financiamento de sellers|credito para sellers|seller financing|merchant financing|credito para lojistas|credito para parceiros)\b/i;
const medicalFinancingSignal = /\b(parcelamento medico|parcelamento de saude|financiamento medico|financiamento de saude|credito para pacientes|credito medico|bnpl de saude|bnpl medico|health financing|medical financing)\b/i;
const agroCreditSignal = /\b(credito rural|financiamento rural|custeio rural|recebiveis do agro|recebiveis agricolas|barter|cp[rr]|frete do agro|fretes do agro|capital de giro rural|financiamento de insumos|credito para produtores|credito ao produtor)\b/i;
const pmeCreditSignal = /\b(credito (?:para|a) pmes?|credito pme|credito (?:para|a) pequenas e medias empresas|capital de giro (?:para|a) pmes?|smb lending|small business lending|financiamento (?:para|a) pmes?)\b/i;

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

const quickQuery = (profile: SearchProfile) => typeof profile.profilePayload?.userQuery === 'string'
  ? profile.profilePayload.userQuery
  : '';

const specificIntentSpec = (profile: SearchProfile): SpecificIntentSpec | null => {
  const context = normalize([
    quickQuery(profile),
    profile.segment,
    profile.subsegment,
    profile.creditProduct,
    profile.receivables.join(' '),
  ].join(' '));

  if (/consignad/.test(context)) {
    if (/consignad\w* privad|privad\w* consignad|credito do trabalhador|\bclt\b/.test(context)) {
      return { id: 'consignado_privado', pattern: consignadoPrivadoSignal };
    }
    return { id: 'consignado', pattern: consignadoSignal };
  }

  if (/embedded finance|financas embutidas|credito embutido|banking as a service|\bbaas\b/.test(context)) {
    return { id: 'embedded_finance', pattern: embeddedFinanceSignal };
  }

  if (/parcelamento medico|parcelamento de saude|financiamento medico|healthtech|credito medico/.test(context)) {
    return { id: 'medical_financing', pattern: medicalFinancingSignal };
  }

  if (/credito rural|custeio rural|frete do agro|fretes do agro|financiamento de insumos/.test(context)) {
    return { id: 'agro_credit', pattern: agroCreditSignal, requiresFinanceContext: true };
  }

  if (/credito pme|credito para pme|credito a pme|smb lending|small business lending/.test(context)) {
    return { id: 'pme_credit', pattern: pmeCreditSignal };
  }

  return null;
};

const isPortfolioHit = (hit: DiscoverySourceHit) => {
  const origin = normalize(hit.rawPayload.origin);
  return hit.sourceRef.startsWith('vc-portfolio:') || origin === 'vc_portfolio_page';
};

const annotate = (
  hit: DiscoverySourceHit,
  input: {
    accepted: boolean;
    rule: string;
    expected: string;
    structureMatched: boolean;
    financeMatched: boolean;
    specificIntent?: SpecificIntentSpec | null;
    specificIntentMatched?: boolean;
  },
): DiscoverySourceHit => ({
  ...hit,
  rawPayload: {
    ...hit.rawPayload,
    relevanceGate: {
      version: 'v15',
      accepted: input.accepted,
      rule: input.rule,
      expected: input.expected,
      structureMatched: input.structureMatched,
      financeMatched: input.financeMatched,
      specificIntent: input.specificIntent?.id ?? null,
      specificIntentMatched: input.specificIntentMatched ?? null,
    },
  },
});

/**
 * Discovery remains high-recall, but specific product searches must not be
 * satisfied by an unrelated finance/FIDC article about the same company.
 *
 * V15 distinguishes:
 * - broad structure search: current FIDC/DCM evidence gate remains;
 * - specific product/subsegment search: evidence must mention that product
 *   family itself. Target structure is a thesis to evaluate later, not a
 *   substitute for product identity.
 *
 * This is still a discovery filter, not qualification or scoring.
 */
export const filterDiscoveryHitsByProfileRelevance = (
  profile: SearchProfile,
  hits: DiscoverySourceHit[],
): DiscoveryRelevanceResult => {
  const expected = expectedSignal(profile);
  const query = quickQuery(profile);
  const specificIntent = specificIntentSpec(profile);
  const allowPortfolioUniverse = explicitPortfolioIntent.test(query);
  const accepted: DiscoverySourceHit[] = [];
  let rejected = 0;
  let specificIntentRejected = 0;

  for (const hit of hits) {
    const evidence = evidenceText(hit);
    const structureMatched = expected.pattern.test(evidence);
    const financeMatched = financeSignal.test(evidence);
    const specificIntentMatched = specificIntent ? specificIntent.pattern.test(evidence) : false;

    if (isPortfolioHit(hit) && allowPortfolioUniverse && !specificIntent) {
      accepted.push(annotate(hit, {
        accepted: true,
        rule: 'explicit_portfolio_universe_intent',
        expected: expected.id,
        structureMatched,
        financeMatched,
        specificIntent,
      }));
      continue;
    }

    if (specificIntent) {
      const financeContextSatisfied = !specificIntent.requiresFinanceContext || financeMatched;
      if (specificIntentMatched && financeContextSatisfied) {
        accepted.push(annotate(hit, {
          accepted: true,
          rule: `matched_specific_${specificIntent.id}_evidence`,
          expected: expected.id,
          structureMatched,
          financeMatched,
          specificIntent,
          specificIntentMatched: true,
        }));
        continue;
      }

      // A FIDC/debt event about an unrelated product does not establish that
      // the company belongs to the requested product universe. Keep that event
      // in the global discovery corpus, but not in this specific query result.
      rejected += 1;
      specificIntentRejected += 1;
      continue;
    }

    if (structureMatched) {
      accepted.push(annotate(hit, {
        accepted: true,
        rule: `matched_${expected.id}_evidence`,
        expected: expected.id,
        structureMatched,
        financeMatched,
        specificIntent,
      }));
      continue;
    }

    if (!normalize(profile.targetStructure) && financeMatched) {
      accepted.push(annotate(hit, {
        accepted: true,
        rule: 'matched_general_finance_evidence',
        expected: expected.id,
        structureMatched,
        financeMatched,
        specificIntent,
      }));
      continue;
    }

    rejected += 1;
  }

  return {
    hits: accepted,
    rejected,
    accepted: accepted.length,
    specificIntentRejected,
  };
};
