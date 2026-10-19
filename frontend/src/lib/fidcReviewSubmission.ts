/**
 * UI validation only. The server and the PostgreSQL function remain the
 * authority for actual identity, reviewer role, source and disposition.
 */
export type FidcDisposition = 'needs_evidence' | 'no_go' | 'refer_to_identity_review';

export type FidcReviewSource = {
  cnpj: string;
  legal_name: string | null;
  review_lane: string;
  registration_status: string | null;
  cvm_evidence_url: string | null;
  registry_url: string | null;
  recommended_review_action: string;
};

export const fidcDispositionLabel: Record<FidcDisposition, string> = {
  needs_evidence: 'Solicitar mais evidências',
  no_go: 'Não priorizar (no-go)',
  refer_to_identity_review: 'Encaminhar à revisão de identidade',
};

export const mayReferFidcToIdentity = (source: FidcReviewSource) =>
  source.review_lane === 'business_model_due_diligence'
  && (source.registration_status ?? '').trim().toUpperCase() === 'ATIVA';

export const validateFidcReviewDraft = (source: FidcReviewSource, values: {
  disposition: FidcDisposition;
  rationale: string;
  nextAction: string;
  acknowledged: boolean;
}) => {
  if (!/^\d{14}$/.test(source.cnpj)) return 'Selecione um CNPJ válido da fila CVM.';
  if (!source.cvm_evidence_url?.startsWith('https://')) return 'A fonte CVM verificável é obrigatória.';
  if (values.disposition === 'refer_to_identity_review' && !mayReferFidcToIdentity(source)) {
    return 'Encaminhamento exige empresa operacional com cadastro ATIVA.';
  }
  if (values.rationale.trim().length < 30 || values.rationale.trim().length > 3000) {
    return 'A justificativa deve conter entre 30 e 3.000 caracteres.';
  }
  if (values.nextAction.trim().length < 10 || values.nextAction.trim().length > 1000) {
    return 'A próxima ação deve conter entre 10 e 1.000 caracteres.';
  }
  if (!values.acknowledged) return 'Confirme que leu as fontes e que não está aprovando crédito.';
  return null;
};
