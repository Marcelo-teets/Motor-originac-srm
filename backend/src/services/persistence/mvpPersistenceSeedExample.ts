import { MvpPersistencePayloadFactory } from './mvpPersistencePayloadFactory.js';

export function buildMvpPersistenceSeedExample() {
  const factory = new MvpPersistencePayloadFactory();

  return factory.build({
    commercialContexts: [
      {
        companyId: 'company_example_fintech_1',
        companyName: 'Example Fintech',
        ownerName: 'Origination',
        stageCode: 'conversa_ventures',
        nextAction: 'Agendar conversa com fundador e time financeiro',
        nextActionDueAt: new Date().toISOString(),
        followUpAt: new Date().toISOString(),
        commercialStatus: 'open',
        rationale: 'Empresa com sinais de funding gap e fit para estrutura de crédito.',
      },
    ],
    rankingContexts: [
      {
        companyId: 'company_example_fintech_1',
        position: 1,
        qualificationScore: 86,
        leadScore: 82,
        rankingScore: 84,
        qualificationScoreDelta: 4,
        leadScoreDelta: 6,
        triggerStrength: 78,
        sourceConfidence: 0.91,
        suggestedStructure: 'FIDC',
        rationale: 'Recebíveis fortes com sinal de expansão e necessidade de funding.',
      },
    ],
    thesisContexts: [
      {
        companyId: 'company_example_fintech_1',
        thesisSummary: 'Empresa com forte aderência a estrutura de crédito baseada em recebíveis.',
        structureType: 'FIDC',
        marketMapSummary: 'Comparable com fintechs de crédito e embedded finance em crescimento.',
        whyNow: 'A empresa apresenta expansão comercial e aumento de intensidade de capital.',
        commercialAngle: 'Abordagem consultiva focada em funding estruturado e eficiência de capital.',
        validationRisks: ['Confirmar qualidade da carteira', 'Validar governança operacional'],
        evidencePayload: {
          evidenceSources: ['company site', 'news', 'monitoring outputs'],
        },
        confidenceScore: 0.88,
      },
    ],
    scoreHistoryContexts: [
      {
        companyId: 'company_example_fintech_1',
        scoreType: 'lead_score',
        previousValue: 76,
        currentValue: 82,
        diff: 6,
        changedBy: 'system',
        rationale: 'Novo trigger de expansão e reforço de fit estrutural.',
        sourceConfidence: 0.91,
        triggerStrength: 78,
        payload: {
          patternSummary: ['growth_without_funding', 'embedded_finance_pressure'],
        },
      },
    ],
  });
}
