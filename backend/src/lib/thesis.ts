import type { CompanyPattern, CompanySeed, QualificationSnapshot, ThesisOutput } from '../types/platform.js';

type PublicEvidence = {
  publicSignalCount?: number;
  riskLevel?: string;
  opportunityScore?: number;
  riskPenalty?: number;
  whyNow?: string[];
  dueDiligenceActions?: string[];
  recommendedStructures?: string[];
  strongestOpportunity?: { summary?: string; amount?: number; signalType?: string } | null;
  strongestRisk?: { summary?: string; amount?: number; signalType?: string; status?: string | null } | null;
};

const asPublicEvidence = (qualification: QualificationSnapshot) => (
  qualification.evidence_payload?.publicEvidence ?? {}
) as PublicEvidence;

const money = (value?: number) => value && value > 0
  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
  : undefined;

const originationBriefNote = (company: CompanySeed) => company.signals
  ?.find((signal) => signal.type === 'origination_brief' && signal.note.trim())
  ?.note.trim();

export const buildThesisOutput = (company: CompanySeed, qualification: QualificationSnapshot, patterns: CompanyPattern[]): ThesisOutput => {
  const strongestPatterns = patterns.slice(0, 3).map((pattern) => pattern.patternName).join(' + ');
  const publicEvidence = asPublicEvidence(qualification);
  const opportunity = publicEvidence.strongestOpportunity;
  const risk = publicEvidence.strongestRisk;
  const opportunityText = opportunity?.summary
    ? ` Evidência pública principal: ${opportunity.summary}${money(opportunity.amount) ? ` (${money(opportunity.amount)})` : ''}.`
    : '';
  const riskText = risk?.summary
    ? ` Condicionante: ${risk.summary}${risk.status ? `; status ${risk.status}` : ''}${money(risk.amount) ? `; exposição ${money(risk.amount)}` : ''}.`
    : '';
  const whyNow = publicEvidence.whyNow?.slice(0, 2).join(' ') ?? '';
  const diligence = publicEvidence.dueDiligenceActions?.slice(0, 2).join(' ') ?? '';
  const publicStructure = publicEvidence.recommendedStructures?.[0];
  const structureType = publicStructure ?? qualification.suggested_structure_type;
  const briefNote = originationBriefNote(company);

  const fallbackSummary = `${company.tradeName} combina ${company.creditProduct.toLowerCase()} com ${company.receivables.join(', ').toLowerCase()}, exibindo gap de capital compatível com ${structureType}. Padrões mais relevantes: ${strongestPatterns || 'sem padrões adicionais'}.${opportunityText}${riskText}${whyNow ? ` Por que agora: ${whyNow}` : ''}`;

  return {
    summary: briefNote
      ? `${briefNote}${riskText}${opportunityText}`
      : fallbackSummary,
    structureType,
    marketMapSummary: briefNote
      ? `Origination Intelligence integrada ao Market Map. Estrutura-base: ${structureType}. Validar lastro/ativos, funding atual, capacidade incremental, contraparte decisora e condições de execução antes da abordagem.${diligence ? ` Diligência prioritária: ${diligence}` : ''}`
      : `Trilha recomendada: ${qualification.fit_fidc ? 'warehouse/cessão para FIDC' : 'nota comercial ou debênture privada'}, condicionada à validação de lastro, estrutura atual e executabilidade.${diligence ? ` Diligência prioritária: ${diligence}` : ''}`,
    confidenceScore: Number(Math.min(0.97, qualification.confidence_score + patterns.length * 0.01 + (publicEvidence.publicSignalCount ? 0.02 : 0) + (briefNote ? 0.02 : 0)).toFixed(2)),
  };
};
