import { getSupabaseClient } from '../lib/supabase.js';
import {
  fetchBcbRegulatedInstitutions,
  type BcbRegulatedInstitution,
} from '../modules/public-data/bcbRegulatedInstitutionsConnector.js';

const SOURCE_CODE = 'src_banco_central_do_brasil_dados_abertos';
const DATASET_CODE = 'bcb_sedes_sociedades_candidates';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

const STOPWORDS = new Set([
  'sa', 's', 'a', 'ltda', 'limitada', 'sociedade', 'credito', 'direto', 'direta',
  'instituicao', 'pagamento', 'financeira', 'financeiro', 'banco', 'bank', 'brasil',
  'servicos', 'servico', 'tecnologia', 'participacoes', 'holding', 'grupo', 'companhia',
  'cia', 'fintech', 'startup', 'empresa', 'plataforma', 'de', 'da', 'do', 'das', 'dos', 'e',
]);

const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const tokens = (value: unknown) => normalize(value)
  .split(' ')
  .filter((token) => token.length >= 2 && !STOPWORDS.has(token));

const domain = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

const domainLabel = (value: unknown) => {
  const parts = domain(value).split('.').filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  if (parts.at(-1) === 'br' && ['com', 'net', 'org', 'eco'].includes(parts.at(-2) ?? '')) return parts.at(-3) ?? '';
  return parts.at(-2) ?? '';
};

export type BcbIdentityMatch = {
  institution: BcbRegulatedInstitution;
  score: number;
  candidateTokens: string[];
  matchedTokens: string[];
};

export const scoreBcbIdentityMatch = (companyName: string, institution: BcbRegulatedInstitution): BcbIdentityMatch => {
  const candidateTokens = [...new Set(tokens(companyName))];
  const legalTokens = new Set(tokens(institution.legalName));
  const matchedTokens = candidateTokens.filter((token) => legalTokens.has(token));
  if (!candidateTokens.length) return { institution, score: 0, candidateTokens, matchedTokens };

  const coverage = matchedTokens.length / candidateTokens.length;
  const longest = Math.max(...candidateTokens.map((token) => token.length), 0);
  const distinctive = candidateTokens.some((token) => /\d/.test(token) || token.length >= 5);
  let score = coverage * 0.82;
  if (coverage === 1 && distinctive) score += 0.13;
  else if (coverage === 1 && longest >= 4) score += 0.08;

  const websiteLabel = normalize(domainLabel(institution.website)).replace(/\s/g, '');
  if (websiteLabel && candidateTokens.some((token) => websiteLabel.includes(token) || token.includes(websiteLabel))) score += 0.04;

  return {
    institution,
    score: Math.min(0.99, Number(score.toFixed(4))),
    candidateTokens,
    matchedTokens,
  };
};

export const selectUniqueBcbIdentityMatch = (
  companyName: string,
  institutions: BcbRegulatedInstitution[],
): BcbIdentityMatch | null => {
  const ranked = institutions
    .map((institution) => scoreBcbIdentityMatch(companyName, institution))
    .filter((match) => match.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  const first = ranked[0];
  if (!first || first.score < 0.90) return null;
  const second = ranked[1];
  if (second && first.score - second.score < 0.08 && first.score < 0.98) return null;
  return first;
};

type CandidateRow = {
  id: string;
  company_name: string;
  legal_name: string | null;
  cnpj: string | null;
  website: string | null;
  normalized_domain: string | null;
  candidate_status: string | null;
  raw_payload: Record<string, unknown> | null;
};

type SourceRow = { id: string; metadata?: Record<string, unknown> | null };
type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;

type Dependencies = {
  client?: SupabaseClient | null;
  fetchInstitutions?: typeof fetchBcbRegulatedInstitutions;
  now?: () => Date;
};

export type CandidateBcbIdentityResult = {
  status: 'completed' | 'no_targets';
  targets: number;
  institutionsLoaded: number;
  matched: number;
  unresolved: number;
  ambiguousSkipped: number;
  websitesAdded: number;
  rfbRootsPrepared: number;
  errors: number;
};

export class CandidateBcbIdentityService {
  private readonly client: SupabaseClient | null;
  private readonly fetchInstitutions: typeof fetchBcbRegulatedInstitutions;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.client = dependencies.client === undefined ? getSupabaseClient() : dependencies.client;
    this.fetchInstitutions = dependencies.fetchInstitutions ?? fetchBcbRegulatedInstitutions;
    this.now = dependencies.now ?? (() => new Date());
  }

  async run(input: { limit?: number } = {}): Promise<CandidateBcbIdentityResult> {
    if (!this.client) throw new Error('Supabase client not configured for candidate BCB identity resolution.');
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const rows = await this.client.select('discovered_company_candidates', {
      select: 'id,company_name,legal_name,cnpj,website,normalized_domain,candidate_status,raw_payload',
      filters: [{ column: 'candidate_status', value: 'captured' }],
      orderBy: { column: 'updated_at', ascending: false },
      limit: 500,
    }) as CandidateRow[];

    let ambiguousSkipped = 0;
    const targets = rows.filter((row) => {
      const raw = row.raw_payload ?? {};
      const semantics = asRecord(raw.commercial_semantics);
      const signalClass = String(semantics.signalClass ?? '');
      const commercial = raw.commercial_queue === true;
      const role = String(raw.candidate_role ?? '');
      const ambiguous = asRecord(raw.first_party_identity_capture).status === 'ambiguous_group';
      if (ambiguous) {
        ambiguousSkipped += 1;
        return false;
      }
      return commercial
        && role === 'operating_company'
        && ['direct_funding_trigger', 'funding_plan_trigger'].includes(signalClass)
        && digits(row.cnpj).length !== 14
        && asRecord(raw.bcb_regulated_identity).status !== 'matched';
    }).slice(0, limit);

    if (!targets.length) {
      return { status: 'no_targets', targets: 0, institutionsLoaded: 0, matched: 0, unresolved: 0, ambiguousSkipped, websitesAdded: 0, rfbRootsPrepared: 0, errors: 0 };
    }

    const dataset = await this.fetchInstitutions();
    const sourceRows = await this.client.select('source_catalog', { select: 'id,metadata', limit: 500 }) as SourceRow[];
    const sourceId = sourceRows.find((row) => row.metadata?.code === SOURCE_CODE)?.id ?? null;
    let matched = 0;
    let unresolved = 0;
    let websitesAdded = 0;
    let rfbRootsPrepared = 0;
    let errors = 0;

    for (const candidate of targets) {
      try {
        const match = selectUniqueBcbIdentityMatch(candidate.company_name, dataset.rows);
        if (!match) {
          unresolved += 1;
          continue;
        }

        const observedAt = this.now().toISOString();
        const officialWebsite = match.institution.website;
        const normalizedDomain = domain(officialWebsite);
        const existingRaw = candidate.raw_payload ?? {};
        const reviewEvidence = `O cadastro oficial de instituições em funcionamento do Banco Central confirma ${match.institution.legalName}, raiz de CNPJ ${match.institution.cnpjRoot}, segmento ${match.institution.segment ?? 'não informado'}${officialWebsite ? ` e website ${officialWebsite}` : ''}. A raiz de 8 dígitos não é tratada como CNPJ completo; a Receita Federal deve completar a identidade jurídica antes da aprovação humana.`;

        await this.client.update('discovered_company_candidates', {
          legal_name: match.institution.legalName,
          ...(officialWebsite && !candidate.website ? { website: officialWebsite } : {}),
          ...(normalizedDomain && !candidate.normalized_domain ? { normalized_domain: normalizedDomain } : {}),
          raw_payload: {
            ...existingRaw,
            identity_review_status: String(existingRaw.identity_review_status ?? 'pending'),
            legal_name_verified: false,
            promotion_ready: false,
            review_legal_name: match.institution.legalName,
            ...(officialWebsite ? { review_website: officialWebsite } : {}),
            review_confidence: match.score,
            review_evidence_summary: reviewEvidence,
            bcb_regulated_identity: {
              version: 1,
              status: 'matched',
              datasetCode: DATASET_CODE,
              sourceCode: SOURCE_CODE,
              sourceId,
              sourceUrl: dataset.sourceUrl,
              cnpjRoot: match.institution.cnpjRoot,
              legalName: match.institution.legalName,
              segment: match.institution.segment,
              email: match.institution.email,
              website: officialWebsite,
              city: match.institution.city,
              state: match.institution.state,
              confidence: match.score,
              matchedTokens: match.matchedTokens,
              observedAt,
              humanApprovalRequired: true,
              automaticPromotion: false,
              automaticDecisionEligibility: false,
            },
            rfb_candidate_identity_target: {
              version: 1,
              status: 'pending',
              cnpjRoot: match.institution.cnpjRoot,
              requestedAt: observedAt,
              reason: 'complete_bcb_cnpj_root_to_full_cnpj',
            },
          },
          updated_at: observedAt,
        }, [{ column: 'id', value: candidate.id }]);

        matched += 1;
        if (officialWebsite && !candidate.website) websitesAdded += 1;
        rfbRootsPrepared += 1;
      } catch {
        errors += 1;
      }
    }

    return {
      status: 'completed',
      targets: targets.length,
      institutionsLoaded: dataset.rows.length,
      matched,
      unresolved,
      ambiguousSkipped,
      websitesAdded,
      rfbRootsPrepared,
      errors,
    };
  }
}
