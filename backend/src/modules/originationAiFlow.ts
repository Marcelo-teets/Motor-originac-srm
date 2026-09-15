import { ORIGINATION_ALLOWED_PRODUCTS, type OriginationProduct } from '../ai/originationAgentDefinitions.js';

export type EvidenceClassification = 'fact' | 'analysis' | 'hypothesis' | 'unknown';
export type EvidenceMateriality = 'low' | 'medium' | 'high' | 'critical';
export type EvidenceStatus = 'active' | 'superseded' | 'disputed' | 'validated';

export type EvidenceFact = {
  id: string;
  evidenceKey: string;
  companyId: string;
  sourceKind: string;
  sourceRecordId?: string | null;
  sourceRef?: string | null;
  fieldKey: string;
  classification: EvidenceClassification;
  value: unknown;
  sourceExcerpt?: string | null;
  confidence: number;
  materiality: EvidenceMateriality;
  effectiveAt?: string | null;
  status: EvidenceStatus;
  metadata?: Record<string, unknown>;
};

export type CanonicalField = {
  value: unknown;
  classification: EvidenceClassification;
  confidence: number;
  status: 'validated' | 'unvalidated' | 'disputed' | 'missing';
  evidenceIds: string[];
  selectedEvidenceId?: string;
  selectedReason?: string;
};

export type AiConflict = {
  companyId: string;
  fieldKey: string;
  severity: EvidenceMateriality;
  conflictType: string;
  evidenceIds: string[];
  description: string;
  recommendedResolution?: string;
  humanQuestion?: string;
  humanReviewRequired: boolean;
};

export type DealMasterPayload = {
  companyId: string;
  companyName: string | null;
  fields: Record<string, CanonicalField>;
  probableProduct: OriginationProduct;
  conflicts: AiConflict[];
  warnings: string[];
  generatedAt: string;
};

export type ReadinessStatus = 'READY' | 'READY_WITH_CAVEATS' | 'NOT_READY';
export type ReadinessResult = {
  score: number;
  status: ReadinessStatus;
  passedChecks: string[];
  failedChecks: string[];
  hardStops: string[];
  caveats: string[];
  humanReviewRequired: boolean;
};

export type IntroPackagePayload = {
  introText: string;
  dealBrief: Record<string, unknown>;
  caveats: string[];
  openQuestions: string[];
  approvalStatus: 'HUMAN_REVIEW';
};

const SOURCE_PRIORITY: Record<string, number> = {
  official_document: 100,
  signed_document: 100,
  financial_statement: 95,
  official_report: 95,
  loan_tape: 90,
  transactional_base: 90,
  client_email: 80,
  outlook: 80,
  meeting_transcript: 70,
  fireflies: 70,
  deal_card: 60,
  pipeline: 55,
  company_master: 50,
  credit_review: 45,
  internal_analysis: 30,
  company_signal: 25,
  agent_hypothesis: 10,
  manual: 50,
};

export const CRITICAL_FIELDS = new Set(['financialNeed', 'requestedAmount', 'probableProduct', 'receivables', 'collateral', 'debtStructure']);

const stableValue = (value: unknown) => JSON.stringify(value, Object.keys((value && typeof value === 'object' && !Array.isArray(value)) ? value as Record<string, unknown> : {}).sort());
const hasValue = (field?: CanonicalField) => field?.status !== 'missing' && field?.status !== 'disputed' && field?.value !== null && field?.value !== undefined && field?.value !== '';
const dateMs = (value?: string | null) => value ? Date.parse(value) || 0 : 0;

const rankEvidence = (evidence: EvidenceFact) =>
  (SOURCE_PRIORITY[evidence.sourceKind] ?? 20) * 1_000_000
  + Math.round(Math.max(0, Math.min(1, evidence.confidence)) * 100_000)
  + Math.floor(dateMs(evidence.effectiveAt) / 86_400_000);

export const normalizeProduct = (value: unknown): OriginationProduct => {
  const normalized = String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');
  if (normalized === 'DEBENTURE') return 'DEBENTURE';
  if (normalized === 'DEBENTURE_INCENTIVADA') return 'DEBENTURE_INCENTIVADA';
  if (ORIGINATION_ALLOWED_PRODUCTS.includes(normalized as typeof ORIGINATION_ALLOWED_PRODUCTS[number])) return normalized as OriginationProduct;
  return 'UNDEFINED';
};

export const buildDealMaster = (
  companyId: string,
  evidence: EvidenceFact[],
  previous?: DealMasterPayload | null,
): DealMasterPayload => {
  const eligible = evidence.filter((item) => item.companyId === companyId && ['active', 'validated', 'disputed'].includes(item.status));
  const grouped = new Map<string, EvidenceFact[]>();
  for (const item of eligible) grouped.set(item.fieldKey, [...(grouped.get(item.fieldKey) ?? []), item]);

  const fields: Record<string, CanonicalField> = {};
  const conflicts: AiConflict[] = [];
  const warnings: string[] = [];

  for (const [fieldKey, items] of grouped) {
    const sorted = [...items].sort((a, b) => rankEvidence(b) - rankEvidence(a));
    const distinct = new Map(sorted.map((item) => [stableValue(item.value), item]));
    const top = sorted[0];
    const critical = CRITICAL_FIELDS.has(fieldKey) || items.some((item) => item.materiality === 'critical');

    if (distinct.size > 1 && critical) {
      const ids = sorted.map((item) => item.id);
      fields[fieldKey] = { value: null, classification: 'unknown', confidence: 0, status: 'disputed', evidenceIds: ids };
      conflicts.push({
        companyId,
        fieldKey,
        severity: 'critical',
        conflictType: 'material_value_conflict',
        evidenceIds: ids,
        description: `Há ${distinct.size} valores materiais distintos para ${fieldKey}.`,
        recommendedResolution: 'Validar a informação com a fonte primária mais apropriada e registrar a decisão humana.',
        humanQuestion: `Qual é o valor correto e vigente para ${fieldKey}?`,
        humanReviewRequired: true,
      });
      continue;
    }

    if (distinct.size > 1) warnings.push(`Divergência não crítica em ${fieldKey}; selecionada a evidência de maior prioridade.`);
    fields[fieldKey] = {
      value: top.value,
      classification: top.classification,
      confidence: top.confidence,
      status: top.status === 'validated' ? 'validated' : 'unvalidated',
      evidenceIds: sorted.map((item) => item.id),
      selectedEvidenceId: top.id,
      selectedReason: `source=${top.sourceKind}; priority=${SOURCE_PRIORITY[top.sourceKind] ?? 20}; confidence=${top.confidence}`,
    };
  }

  const probableProduct = normalizeProduct(fields.probableProduct?.value);
  const previousProduct = previous?.probableProduct ?? 'UNDEFINED';
  if (previousProduct !== 'UNDEFINED' && probableProduct !== 'UNDEFINED' && previousProduct !== probableProduct) {
    conflicts.push({
      companyId,
      fieldKey: 'probableProduct',
      severity: 'critical',
      conflictType: 'product_change',
      evidenceIds: fields.probableProduct?.evidenceIds ?? [],
      description: `Mudança de produto provável: ${previousProduct} -> ${probableProduct}.`,
      recommendedResolution: 'Validar a mudança de produto antes de avançar para Estruturação.',
      humanQuestion: `Confirmar mudança do produto provável de ${previousProduct} para ${probableProduct}?`,
      humanReviewRequired: true,
    });
  }

  return {
    companyId,
    companyName: hasValue(fields.companyName) ? String(fields.companyName.value) : null,
    fields,
    probableProduct,
    conflicts,
    warnings,
    generatedAt: new Date().toISOString(),
  };
};

export const calculateReadiness = (deal: DealMasterPayload, openCriticalConflicts = 0): ReadinessResult => {
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const caveats: string[] = [];
  const hardStops: string[] = [];
  let score = 0;
  const f = deal.fields;

  const check = (name: string, weight: number, ok: boolean, caveat?: string) => {
    if (ok) { score += weight; passedChecks.push(name); }
    else { failedChecks.push(name); if (caveat) caveats.push(caveat); }
  };

  check('identification', 5, Boolean(deal.companyName), 'Empresa não identificada.');
  check('context', 10, hasValue(f.context), 'Contexto comercial incompleto.');
  check('financial_need', 15, hasValue(f.financialNeed), 'Necessidade financeira não está clara.');
  check('amount_timing', 10, hasValue(f.requestedAmount) && hasValue(f.timing), 'Valor e/ou timing incompletos.');
  check('probable_structure', 15, deal.probableProduct !== 'UNDEFINED', 'Produto provável não definido.');
  check('receivables_collateral', 15, hasValue(f.receivables) || hasValue(f.collateral), 'Recebíveis/lastro/garantias não mapeados.');
  check('financials', 10, hasValue(f.financials), 'Informações financeiras insuficientes.');
  check('documentation', 10, hasValue(f.documentation), 'Documentação mínima não confirmada.');
  check('validation', 10, deal.conflicts.every((conflict) => conflict.severity !== 'critical') && openCriticalConflicts === 0, 'Há divergência crítica aberta.');

  if (!deal.companyName) hardStops.push('company_not_identified');
  if (!hasValue(f.financialNeed)) hardStops.push('financial_need_unknown');
  if (deal.probableProduct === 'UNDEFINED') hardStops.push('probable_product_undefined');
  if (deal.conflicts.some((conflict) => conflict.severity === 'critical') || openCriticalConflicts > 0) hardStops.push('critical_conflict_open');

  if (['FIDC', 'CRI', 'CRA'].includes(deal.probableProduct) && !hasValue(f.receivables) && !hasValue(f.collateral)) {
    hardStops.push('material_lastro_missing');
  }
  if (deal.probableProduct === 'DEBENTURE_INCENTIVADA' && !hasValue(f.incentiveEligibility)) {
    hardStops.push('incentive_eligibility_missing');
  }

  const status: ReadinessStatus = hardStops.length > 0 ? 'NOT_READY' : score >= 85 ? 'READY' : score >= 70 ? 'READY_WITH_CAVEATS' : 'NOT_READY';
  return { score, status, passedChecks, failedChecks, hardStops: [...new Set(hardStops)], caveats: [...new Set(caveats)], humanReviewRequired: hardStops.includes('critical_conflict_open') };
};

export const composeIntroPackage = (deal: DealMasterPayload, readiness: ReadinessResult): IntroPackagePayload => {
  if (readiness.status === 'NOT_READY' || readiness.hardStops.length > 0) throw new Error('Deal NOT_READY: Intro não pode ser gerada.');
  if (deal.conflicts.some((conflict) => conflict.severity === 'critical')) throw new Error('Conflito crítico aberto: Intro não pode ser gerada.');

  const value = (key: string) => hasValue(deal.fields[key]) ? deal.fields[key].value : null;
  const introParts = [
    deal.companyName ? `${deal.companyName}` : null,
    value('context') ? String(value('context')) : null,
    value('financialNeed') ? `A necessidade financeira identificada é ${String(value('financialNeed'))}.` : null,
    value('requestedAmount') ? `Valor indicativo: ${String(value('requestedAmount'))}.` : null,
    deal.probableProduct !== 'UNDEFINED' ? `Produto provável para avaliação: ${deal.probableProduct.replaceAll('_', ' ')}.` : null,
  ].filter(Boolean);

  return {
    introText: introParts.join(' '),
    dealBrief: {
      company: deal.companyName,
      context: value('context'),
      financialNeed: value('financialNeed'),
      requestedAmount: value('requestedAmount'),
      timing: value('timing'),
      probableProduct: deal.probableProduct,
      receivables: value('receivables'),
      collateral: value('collateral'),
      debtStructure: value('debtStructure'),
      financials: value('financials'),
      documentation: value('documentation'),
    },
    caveats: readiness.caveats,
    openQuestions: readiness.failedChecks,
    approvalStatus: 'HUMAN_REVIEW',
  };
};
