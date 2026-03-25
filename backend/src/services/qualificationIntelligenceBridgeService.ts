import type { PlatformService } from './platformService.js';
import { CompanyIntelligenceService } from './companyIntelligenceService.js';

export type QualificationIntelligenceBridge = {
  companyId: string;
  qualificationScore: number;
  intelligenceConfidence: number;
  fitForStructuredCredit: boolean;
  fitFidcHint: boolean;
  fitDcmHint: boolean;
  capitalNeedHint: boolean;
  receivablesHint: boolean;
  recommendedCommercialAction: string;
  recommendedStructuralAction: string;
};

export class QualificationIntelligenceBridgeService {
  private readonly intelligenceService = new CompanyIntelligenceService();

  constructor(private readonly platformService: PlatformService) {}

  async build(companyId: string): Promise<QualificationIntelligenceBridge | null> {
    const detail = await this.platformService.getCompanyDetail(companyId);
    if (!detail) return null;

    const intelligence = await this.intelligenceService.getCompanySummary(companyId);
    const receivablesHint = intelligence.inferredFlags.hasReceivablesEvidence;
    const capitalNeedHint = intelligence.inferredFlags.hasFundingSignal;
    const fitFidcHint = intelligence.inferredFlags.hasFidcEvidence || (receivablesHint && capitalNeedHint);
    const fitDcmHint = capitalNeedHint && detail.scores.lead >= 65;
    const fitForStructuredCredit = intelligence.inferredFlags.fitForStructuredCredit || fitFidcHint || fitDcmHint;

    return {
      companyId,
      qualificationScore: detail.scores.qualification,
      intelligenceConfidence: intelligence.intelligenceConfidence,
      fitForStructuredCredit,
      fitFidcHint,
      fitDcmHint,
      capitalNeedHint,
      receivablesHint,
      recommendedCommercialAction: fitForStructuredCredit
        ? 'Priorizar abordagem com tese estruturada e validação de timing.'
        : 'Expandir cobertura de fontes antes da priorização comercial.',
      recommendedStructuralAction: fitFidcHint
        ? 'Testar aderência a FIDC/recebíveis com base nos sinais capturados.'
        : fitDcmHint
          ? 'Testar estrutura de dívida corporativa/NC/debênture.'
          : 'Manter em monitoramento e ampliar enrichment antes de estruturar.',
    };
  }
}
