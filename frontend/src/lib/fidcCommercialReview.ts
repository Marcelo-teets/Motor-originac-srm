/**
 * FIDC assignor review is identity/source evidence, NOT credit qualification.
 * Keep filtering purely presentational: no promotion, scoring or database writes.
 */
export type FidcReviewLane =
  | 'business_model_due_diligence'
  | 'registry_lookup_pending'
  | 'registration_exception_review'
  | 'regulated_entity_review';

export type FidcReviewItem = {
  cnpj: string;
  legal_name: string | null;
  registration_status: string | null;
  registry_url: string | null;
  cvm_evidence_url: string | null;
  cvm_reference_date?: string | null;
  review_lane: string;
  recommended_review_action: string;
  icp_eligibility_status: string;
  receivables_structurability_status: string;
  funding_gap_status: string;
  distinct_funds: number;
  evidence_links: number;
  auto_promotion_authorized: boolean;
};

export const FIDC_REVIEW_LANES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'business_model_due_diligence', label: 'Modelo de negócio' },
  { value: 'registry_lookup_pending', label: 'Identidade pendente' },
  { value: 'registration_exception_review', label: 'Exceção cadastral' },
  { value: 'regulated_entity_review', label: 'Entidade regulada' },
];

const laneOrder = new Map(FIDC_REVIEW_LANES.map((lane, index) => [lane.value, index]));
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function filterFidcReviewItems(items: readonly FidcReviewItem[], search: string, lane: string) {
  const query = fold(search.trim());
  // Only punctuation is insignificant in a CNPJ, never its letters. Avoid
  // matching the numeric fragment of an alphanumeric identity to another tax ID.
  const identityQuery = search.trim().toUpperCase().replace(/[.\/\-\s]/g, '');
  const searchByIdentity = /^[A-Z0-9]{4,14}$/.test(identityQuery);
  return items.filter((item) => {
    if (lane && item.review_lane !== lane) return false;
    if (!query) return true;
    const searchable = fold([item.legal_name, item.cnpj, item.registration_status].filter(Boolean).join(' '));
    const canonicalCnpj = item.cnpj.toUpperCase().replace(/[.\/\-\s]/g, '');
    return searchable.includes(query) || (searchByIdentity && canonicalCnpj.includes(identityQuery));
  }).sort((a, b) => {
    const laneDiff = (laneOrder.get(a.review_lane) ?? 99) - (laneOrder.get(b.review_lane) ?? 99);
    if (laneDiff) return laneDiff;
    const evidenceDiff = (Number(b.evidence_links) || 0) - (Number(a.evidence_links) || 0);
    if (evidenceDiff) return evidenceDiff;
    return (a.legal_name || a.cnpj).localeCompare(b.legal_name || b.cnpj, 'pt-BR');
  });
}

export function buildFidcReviewChecklist(item: FidcReviewItem) {
  return [
    'MOTOR — FICHA DE DILIGÊNCIA DE CEDENTE FIDC (RASCUNHO)',
    'O vínculo com FIDC não comprova crédito, recebíveis estruturáveis ou necessidade de funding.',
    `Empresa: ${item.legal_name || 'razão social pendente'}`,
    `CNPJ: ${item.cnpj}`,
    `Situação cadastral: ${item.registration_status || 'não verificada'}`,
    `Fundos vinculados: ${item.distinct_funds || 0} | Vínculos de evidência: ${item.evidence_links || 0}`,
    `Evidência CVM: ${item.cvm_evidence_url || 'pendente'}`,
    `Registro cadastral: ${item.registry_url || 'pendente'}`,
    `ICP: ${item.icp_eligibility_status || 'unverified'}`,
    `Recebíveis estruturáveis: ${item.receivables_structurability_status || 'unknown'}`,
    `Funding gap: ${item.funding_gap_status || 'unknown'}`,
    `Próxima diligência: ${item.recommended_review_action || 'Confirmar modelo de negócio e lastro'}`,
    '',
    '[ ] Confirmar identidade jurídica, atividade operacional, status e domínio da empresa',
    '[ ] Evidenciar produto de crédito e/ou recebíveis, sem inferir a partir do FIDC',
    '[ ] Validar lastro, originação, ticket, funding atual e estrutura de capital',
    '[ ] Registrar fonte, data, fatos observados, inferências e campos unknown',
    '[ ] Documentar fit Brasil tech/tech-backed e motivos de go/no-go',
    '[ ] Obter revisão humana e responsável antes de qualquer promoção ou score',
    '',
    'Decisão: PENDENTE DE REVISÃO HUMANA — este rascunho não altera o banco.',
  ].join('\n');
}
