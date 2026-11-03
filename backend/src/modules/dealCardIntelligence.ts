import { createHash } from 'node:crypto';
import { ORIGINATION_ALLOWED_PRODUCTS, type OriginationProduct } from '../ai/originationAgentDefinitions.js';

/**
 * Deal Card v1: deterministic, deal-scoped intelligence. It never claims that
 * unstructured text was verified, nor decides legal eligibility or credit approval.
 * Callers must enforce user membership before reading/writing any scoped records.
 */
export type DealSourceProvider = 'fireflies' | 'teams' | 'outlook_email' | 'outlook_calendar' | 'sharepoint' | 'client_folder' | 'crm' | 'manual';
export type ClaimStatus = 'proposed' | 'validated' | 'disputed' | 'superseded';
export type ClaimType = 'fact' | 'analysis' | 'hypothesis' | 'unknown';
export type Materiality = 'low' | 'medium' | 'high' | 'critical';

export type Opportunity = {
  id: string;
  companyId: string;
  title: string;
  product: OriginationProduct;
  stage: string;
  status: string;
  revisitOf?: string | null;
  ownerUserId: string;
};
export type DealSource = {
  id: string;
  opportunityId: string;
  provider: DealSourceProvider;
  externalId: string;
  contentHash: string;
  title: string;
  sourceRef?: string | null;
  occurredAt?: string | null;
  ingestedAt: string;
  matchMethod: 'explicit' | 'human_approved';
};
export type DealClaim = {
  id: string;
  opportunityId: string;
  sourceId: string;
  field: string;
  value: unknown;
  period?: string | null;
  claimType: ClaimType;
  materiality: Materiality;
  status: ClaimStatus;
  confidence: number;
  effectiveAt?: string | null;
  reviewedBy?: string | null;
};
export type DealEvent = {
  id: string;
  opportunityId: string;
  type: 'meeting' | 'decision' | 'action' | 'risk' | 'stage_change' | 'note';
  title: string;
  happenedAt: string;
  owner?: string | null;
  dueAt?: string | null;
  state?: 'open' | 'done' | 'blocked' | null;
  sourceId?: string | null;
};
export type Originator = { id: string; displayName: string; attribution?: string | null };

export type CaptureInput = {
  opportunityId?: string;
  provider: DealSourceProvider;
  externalId: string;
  title: string;
  sourceRef?: string | null;
  occurredAt?: string | null;
  content?: string;
  /** Explicitly mapped by a user, or approved by the human review queue. */
  mappingApproved?: boolean;
  /** Proposed extractor claims, not pre-validated facts. */
  claims?: Array<{ field: string; value: unknown; period?: string; materiality?: Materiality; confidence?: number; claimType?: ClaimType }>;
};
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
};
const stamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const priority: Record<DealSourceProvider, number> = {
  client_folder: 90, sharepoint: 90, outlook_email: 75, fireflies: 65,
  teams: 65, outlook_calendar: 40, crm: 50, manual: 45,
};
const criticalFields = new Set([
  'requestedAmount', 'probableProduct', 'receivables', 'loanTape', 'assignmentEligibility',
  'collateral', 'debtStructure', 'financials', 'cashflow', 'contract', 'legalOpinion',
]);

/**
 * Adapter common to Fireflies/Teams/Outlook/SharePoint/CRM exports.
 * Raw transcripts/messages are hashed, not copied into the card or database.
 * No entity match by company name alone; ambiguous records remain quarantined.
 */
export function normalizeCapture(input: CaptureInput) {
  if (!input.provider || !input.externalId?.trim() || !input.title?.trim()) {
    throw new Error('provider, externalId e title são obrigatórios.');
  }
  if (!input.opportunityId || !input.mappingApproved) {
    return { state: 'quarantine' as const, reason: 'Vínculo à oportunidade sem aprovação explícita.', source: null, claims: [] };
  }
  const contentHash = sha(input.content ?? canonical({
    title: input.title, ref: input.sourceRef, time: input.occurredAt, claims: input.claims ?? [],
  }));
  const sourceKey = sha([input.opportunityId, input.provider, input.externalId, contentHash].join('|'));
  return {
    state: 'ready' as const,
    reason: null,
    source: {
      opportunityId: input.opportunityId,
      provider: input.provider,
      externalId: input.externalId,
      title: input.title.trim(),
      sourceRef: input.sourceRef ?? null,
      occurredAt: input.occurredAt ?? null,
      contentHash,
      sourceKey,
      matchMethod: 'human_approved' as const,
    },
    claims: (input.claims ?? []).filter(c => c.field?.trim()).map((claim, index) => ({
      evidenceKey: sha(sourceKey + '|' + claim.field + '|' + String(claim.period ?? '') + '|' + canonical(claim.value)),
      field: claim.field,
      value: claim.value,
      period: claim.period ?? null,
      claimType: claim.claimType ?? 'fact' as ClaimType,
      materiality: claim.materiality ?? 'medium' as Materiality,
      confidence: Math.max(0, Math.min(1, Number(claim.confidence ?? 0.6))),
      status: 'proposed' as const,
      sequence: index,
    })),
  };
}

export type CardField = {
  value: unknown;
  status: 'validated' | 'pending_review' | 'disputed';
  period: string | null;
  confidence: number;
  evidenceIds: string[];
  sourceIds: string[];
  selectedEvidenceId?: string;
};
export type DealCard = {
  schemaVersion: '1.0.0';
  opportunity: Opportunity;
  originators: Originator[];
  fields: Record<string, CardField>;
  executiveSummary: string;
  glossary: Array<{ term: string; definition: string }>;
  conflicts: Array<{ field: string; period: string | null; evidenceIds: string[]; severity: Materiality; action: string }>;
  readiness: { status: 'BLOCKED' | 'REVIEW_REQUIRED' | 'INFORMATIONAL'; missing: string[]; humanApprovalRequired: true };
  actions: DealEvent[];
  history: DealEvent[];
  sources: DealSource[];
  coverage: { provider: DealSourceProvider; count: number }[];
  generatedAt: string;
};
const mandatoryByProduct: Record<string, string[]> = {
  FIDC: ['financialNeed', 'requestedAmount', 'receivables', 'loanTape', 'contract', 'assignmentEligibility', 'financials'],
  CRI: ['financialNeed', 'requestedAmount', 'receivables', 'contract', 'assignmentEligibility', 'financials'],
  CRA: ['financialNeed', 'requestedAmount', 'receivables', 'contract', 'assignmentEligibility', 'financials'],
  DEBENTURE: ['financialNeed', 'requestedAmount', 'financials', 'debtStructure', 'cashflow'],
  DEBENTURE_INCENTIVADA: ['financialNeed', 'requestedAmount', 'financials', 'debtStructure', 'cashflow', 'incentiveEligibility'],
};

const BASIC_GLOSSARY = [
  { term: 'Lastro', definition: 'Ativo, crédito ou direito que sustenta economicamente o fluxo da operação; sua elegibilidade requer análise documental.' },
  { term: 'Cessão', definition: 'Transferência de um direito creditório conforme instrumento, condições e formalidades aplicáveis.' },
  { term: 'Coobrigação', definition: 'Possível responsabilidade adicional do cedente ou terceiro pelo pagamento, sujeita aos termos contratuais.' },
];
const PRODUCT_GLOSSARY: Record<string, Array<{term:string;definition:string}>> = {
  FIDC: [
    {term:'FIDC',definition:'Fundo de investimento em direitos creditórios, submetido à regulamentação aplicável da CVM.'},
    {term:'Subordinação',definition:'Ordem contratual de absorção de perdas e preferência de pagamento entre classes/subclasses, conforme documentos.'},
    {term:'Loan tape',definition:'Base granular da carteira, idealmente por contrato/parcela, utilizada para análises financeiras e de risco.'},
  ],
  CRI: [{term:'CRI',definition:'Certificado de Recebíveis Imobiliários; exige vínculo e enquadramento do lastro.'}],
  CRA: [{term:'CRA',definition:'Certificado de Recebíveis do Agronegócio; exige vínculo e enquadramento do lastro.'}],
  DEBENTURE: [{term:'Debênture',definition:'Título de dívida emitido por companhia, regido por escritura e legislação aplicável.'}],
  DEBENTURE_INCENTIVADA: [{term:'Debênture incentivada',definition:'Debênture sujeita a requisitos legais e setoriais específicos para o enquadramento de incentivo.'}],
};
const formatAmount = (value: unknown) => typeof value === 'number'
  ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value)
  : typeof value === 'string' ? value : 'não validado';
const cardNarrative = (opportunity: Opportunity, fields: Record<string, CardField>) => {
  const read = (key: string) => Object.entries(fields).find(([name,value]) =>
    name.split('@')[0] === key && value.status === 'validated')?.[1]?.value;
  const parts = [
    `Operação ${opportunity.product.replaceAll('_',' ')} de ${opportunity.title}, atualmente em ${opportunity.stage}.`,
  ];
  const amount=read('requestedAmount');
  if(amount!==undefined)parts.push(`Valor indicado e validado: ${formatAmount(amount)}.`);
  const need=read('financialNeed');
  if(typeof need==='string' && need.trim())parts.push(`Finalidade: ${need.trim()}.`);
  if(read('receivables')!==undefined)parts.push('Informações de recebíveis constam das evidências validadas; elegibilidade jurídica não foi presumida.');
  if(parts.length===1)parts.push('Detalhes financeiros, lastro e termos ainda dependem de revisão de evidências.');
  return parts.join(' ');
};

export function assembleDealCard(input: {
  opportunity: Opportunity;
  sources: DealSource[];
  claims: DealClaim[];
  events: DealEvent[];
  originators?: Originator[];
  generatedAt?: string;
}): DealCard {
  const { opportunity } = input;
  if (!opportunity?.id || !opportunity.companyId) throw new Error('Oportunidade sem identidade canônica.');
  const sources = input.sources.filter(s => s.opportunityId === opportunity.id);
  const sourceMap = new Map(sources.map(s => [s.id, s]));
  const claims = input.claims.filter(c => c.opportunityId === opportunity.id
    && sourceMap.has(c.sourceId) && c.status !== 'superseded');
  const grouped = new Map<string, DealClaim[]>();
  for (const c of claims) {
    const key = c.field + '|' + String(c.period ?? '');
    grouped.set(key, [...(grouped.get(key) ?? []), c]);
  }
  const fields: Record<string, CardField> = {};
  const conflicts: DealCard['conflicts'] = [];
  for (const group of grouped.values()) {
    const ordered = [...group].sort((a, b) => {
      const pa = sourceMap.get(a.sourceId)?.provider ?? 'manual';
      const pb = sourceMap.get(b.sourceId)?.provider ?? 'manual';
      // Strict lexicographic ranking: timestamps must never overpower human validation.
      const validation = Number(b.status === 'validated') - Number(a.status === 'validated');
      if (validation) return validation;
      const sourceRank = priority[pb] - priority[pa];
      if (sourceRank) return sourceRank;
      const confidence = b.confidence - a.confidence;
      if (confidence) return confidence;
      return stamp(b.effectiveAt) - stamp(a.effectiveAt);
    });
    const first = ordered[0];
    const variants = new Set(ordered.map(c => canonical(c.value)));
    const material = ordered.some(c => c.materiality === 'critical' || criticalFields.has(c.field));
    const disputed = ordered.some(c => c.status === 'disputed') || (material && variants.size > 1);
    const key = first.period ? first.field + '@' + first.period : first.field;
    fields[key] = {
      value: disputed ? null : first.value,
      status: disputed ? 'disputed' : first.status === 'validated' ? 'validated' : 'pending_review',
      period: first.period ?? null,
      confidence: disputed ? 0 : first.confidence,
      evidenceIds: ordered.map(c => c.id),
      sourceIds: [...new Set(ordered.map(c => c.sourceId))],
      ...(!disputed ? { selectedEvidenceId: first.id } : {}),
    };
    if (disputed) conflicts.push({
      field: first.field, period: first.period ?? null,
      evidenceIds: ordered.map(c => c.id),
      severity: material ? 'critical' : 'medium',
      action: 'Conferir as fontes primárias e registrar uma decisão humana.',
    });
  }
  const product = opportunity.product;
  const missing = (mandatoryByProduct[product] ?? ['financialNeed', 'requestedAmount']).filter(name =>
    !Object.entries(fields).some(([key, field]) => key.split('@')[0] === name && field.status === 'validated'));
  if (!ORIGINATION_ALLOWED_PRODUCTS.includes(product as typeof ORIGINATION_ALLOWED_PRODUCTS[number])) {
    missing.unshift('produto_valido');
  }
  const blocked = conflicts.some(c => c.severity === 'critical');
  const events = input.events.filter(e => e.opportunityId === opportunity.id)
    .sort((a, b) => stamp(b.happenedAt) - stamp(a.happenedAt));
  const coverage = [...new Set(sources.map(s => s.provider))].sort().map(provider => ({
    provider, count: sources.filter(s => s.provider === provider).length,
  }));
  return {
    schemaVersion: '1.0.0',
    opportunity,
    originators: input.originators ?? [],
    fields, conflicts,
    executiveSummary: cardNarrative(opportunity, fields),
    glossary: [...(PRODUCT_GLOSSARY[product] ?? []), ...BASIC_GLOSSARY],
    readiness: {
      status: blocked ? 'BLOCKED' : missing.length ? 'REVIEW_REQUIRED' : 'INFORMATIONAL',
      missing,
      humanApprovalRequired: true,
    },
    actions: events.filter(e => e.type === 'action' && e.state !== 'done'),
    history: events,
    sources, coverage,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}
