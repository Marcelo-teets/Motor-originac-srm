export class PreCallBriefingService {
  build(input: {
    companyName: string;
    thesis?: string;
    whyNow?: string;
    topSignals?: string[];
    stakeholders?: Array<{ name: string; title?: string }>;
    objections?: Array<{ objection_text?: string; status?: string }>;
    nextStep?: string;
  }) {
    return {
      companyName: input.companyName,
      thesis: input.thesis ?? 'Tese ainda em consolidacao.',
      whyNow: input.whyNow ?? 'Sem why now consolidado.',
      topSignals: input.topSignals ?? [],
      stakeholders: input.stakeholders ?? [],
      openObjections: (input.objections ?? []).filter((item) => item.status !== 'resolved'),
      recommendedNextStep: input.nextStep ?? 'Executar contato executivo com hipotese de funding e estrutura.',
      suggestedCallToAction: 'Validar dor de funding, timing e aderencia estrutural com foco em recebiveis/capital mismatch.',
    };
  }
}
