import type { CompanySeed } from '../types/platform.js';

type SignalView = CompanySeed['signals'][number];

export type SourceTreatmentRule = {
  signalType: string;
  signalFamily: string;
  strengthFloor: number;
  confidenceDelta: number;
  structuralScoreDelta: number;
  timingScoreDelta: number;
  executabilityScoreDelta: number;
  patternTags: string[];
  treatmentPolicy: {
    nextAction: string;
    qualificationUse: string;
    riskDisposition?: 'positive' | 'caution' | 'red_flag';
  };
};

export type AppliedSourceTreatment = SourceTreatmentRule & {
  signalSource: string;
  signalStrength: number;
  confidenceScore: number;
  note: string;
  appliedStructuralDelta: number;
  appliedTimingDelta: number;
  appliedExecutabilityDelta: number;
};

export type SourceTreatmentImpact = {
  treatedSignalsCount: number;
  actionableSignalsCount: number;
  structuralScoreDelta: number;
  timingScoreDelta: number;
  executabilityScoreDelta: number;
  totalTreatmentDelta: number;
  maxSignalStrength: number;
  avgConfidenceScore: number;
  signalTypes: string[];
  signalFamilies: string[];
  patternTags: string[];
  positiveSignals: string[];
  riskSignals: string[];
  nextActions: string[];
  applied: AppliedSourceTreatment[];
};

const cap = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const uniq = <T>(items: T[]) => Array.from(new Set(items));
const avg = (items: number[]) => (items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : 0);

export const SOURCE_TREATMENT_RULES: SourceTreatmentRule[] = [
  {
    signalType: 'public_contract_receivables',
    signalFamily: 'receivables',
    strengthFloor: 82,
    confidenceDelta: 0.05,
    structuralScoreDelta: 8,
    timingScoreDelta: 5,
    executabilityScoreDelta: 6,
    patternTags: ['receivables_strong', 'funding_gap'],
    treatmentPolicy: {
      nextAction: 'Validar contrato público, prazo de pagamento, devedor e cessibilidade.',
      qualificationUse: 'Sobe receivables fit e tese de FIDC/warehouse quando a evidência for confirmada.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'regulatory_event',
    signalFamily: 'timing',
    strengthFloor: 78,
    confidenceDelta: 0.04,
    structuralScoreDelta: 3,
    timingScoreDelta: 8,
    executabilityScoreDelta: 4,
    patternTags: ['timing_trigger', 'governance_signal'],
    treatmentPolicy: {
      nextAction: 'Confirmar ato, entidade emissora, materialidade e impacto financeiro.',
      qualificationUse: 'Sobe timing quando o evento é recente e relevante.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'legal_compliance_risk',
    signalFamily: 'risk',
    strengthFloor: 84,
    confidenceDelta: -0.08,
    structuralScoreDelta: 0,
    timingScoreDelta: 5,
    executabilityScoreDelta: -10,
    patternTags: ['risk_signal'],
    treatmentPolicy: {
      nextAction: 'Checar severidade, data, esfera e status da sanção antes de abordar.',
      qualificationUse: 'Reduz executabilidade até validação de compliance.',
      riskDisposition: 'red_flag',
    },
  },
  {
    signalType: 'fiscal_stress',
    signalFamily: 'risk',
    strengthFloor: 82,
    confidenceDelta: -0.06,
    structuralScoreDelta: 0,
    timingScoreDelta: 4,
    executabilityScoreDelta: -8,
    patternTags: ['capital_mismatch', 'risk_signal'],
    treatmentPolicy: {
      nextAction: 'Validar certidão, valor, natureza da dívida e materialidade.',
      qualificationUse: 'Sobe urgência de funding, mas reduz readiness se a pendência for material.',
      riskDisposition: 'caution',
    },
  },
  {
    signalType: 'liquidity_stress',
    signalFamily: 'risk',
    strengthFloor: 84,
    confidenceDelta: -0.08,
    structuralScoreDelta: 0,
    timingScoreDelta: 5,
    executabilityScoreDelta: -8,
    patternTags: ['liquidity_stress', 'risk_signal'],
    treatmentPolicy: {
      nextAction: 'Validar protesto oficial, montante, recorrência e data.',
      qualificationUse: 'Sobe funding gap e reduz executabilidade até confirmação.',
      riskDisposition: 'caution',
    },
  },
  {
    signalType: 'judicial_stress',
    signalFamily: 'risk',
    strengthFloor: 95,
    confidenceDelta: -0.15,
    structuralScoreDelta: 0,
    timingScoreDelta: 10,
    executabilityScoreDelta: -20,
    patternTags: ['distress', 'risk_signal'],
    treatmentPolicy: {
      nextAction: 'Validar processo, polo, valor, status e se há tese distressed.',
      qualificationUse: 'Red flag severa; só seguir como distressed credit ou com validação humana.',
      riskDisposition: 'red_flag',
    },
  },
  {
    signalType: 'demand_quality_risk',
    signalFamily: 'asset_quality',
    strengthFloor: 72,
    confidenceDelta: -0.03,
    structuralScoreDelta: 0,
    timingScoreDelta: 3,
    executabilityScoreDelta: -4,
    patternTags: ['receivables_quality', 'risk_signal'],
    treatmentPolicy: {
      nextAction: 'Checar volume, natureza das reclamações e impacto em recebíveis.',
      qualificationUse: 'Exige revisão de qualidade de recebíveis.',
      riskDisposition: 'caution',
    },
  },
  {
    signalType: 'product_credit_terms',
    signalFamily: 'structural_need',
    strengthFloor: 83,
    confidenceDelta: 0.08,
    structuralScoreDelta: 12,
    timingScoreDelta: 5,
    executabilityScoreDelta: 5,
    patternTags: ['embedded_finance_pressure', 'credit_is_core'],
    treatmentPolicy: {
      nextAction: 'Validar produto, tomador, ativo gerado e funding necessário.',
      qualificationUse: 'Pode confirmar produto de crédito e necessidade de funding dedicada.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'credit_team_hiring',
    signalFamily: 'latent_growth',
    strengthFloor: 77,
    confidenceDelta: 0.04,
    structuralScoreDelta: 5,
    timingScoreDelta: 7,
    executabilityScoreDelta: 3,
    patternTags: ['growth_without_funding', 'embedded_finance_pressure'],
    treatmentPolicy: {
      nextAction: 'Mapear área, senioridade, volume de vagas e dono provável da pauta.',
      qualificationUse: 'Sinal latente de buildout de crédito, cobrança ou funding pressure.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'headcount_acceleration',
    signalFamily: 'latent_growth',
    strengthFloor: 76,
    confidenceDelta: 0.04,
    structuralScoreDelta: 2,
    timingScoreDelta: 8,
    executabilityScoreDelta: 1,
    patternTags: ['growth_without_funding', 'expansion_outpacing_capital'],
    treatmentPolicy: {
      nextAction: 'Comparar crescimento efetivo do quadro com vagas abertas, funding recente e expansão operacional.',
      qualificationUse: 'Headcount em aceleração aumenta timing, mas não comprova necessidade de crédito sem sinais complementares.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'capital_markets_hiring',
    signalFamily: 'capital_structure',
    strengthFloor: 85,
    confidenceDelta: 0.06,
    structuralScoreDelta: 4,
    timingScoreDelta: 10,
    executabilityScoreDelta: 7,
    patternTags: ['capital_mismatch', 'timing_trigger'],
    treatmentPolicy: {
      nextAction: 'Identificar cargo, senioridade, mandato provável e decisor financeiro para abordagem DCM.',
      qualificationUse: 'Contratação em Capital Markets é forte sinal de preparação para funding/estruturação, sem assumir que uma emissão já foi decidida.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'funding_team_hiring',
    signalFamily: 'capital_structure',
    strengthFloor: 84,
    confidenceDelta: 0.05,
    structuralScoreDelta: 5,
    timingScoreDelta: 10,
    executabilityScoreDelta: 5,
    patternTags: ['capital_mismatch', 'funding_gap'],
    treatmentPolicy: {
      nextAction: 'Mapear funding atual, custo, prazo, gaps de liquidez e responsável pela nova função.',
      qualificationUse: 'Buildout de Funding/Tesouraria eleva timing de originação e sugere aumento de complexidade de capital.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'credit_infrastructure_buildout',
    signalFamily: 'structural_need',
    strengthFloor: 82,
    confidenceDelta: 0.05,
    structuralScoreDelta: 8,
    timingScoreDelta: 8,
    executabilityScoreDelta: 4,
    patternTags: ['embedded_finance_pressure', 'growth_without_funding'],
    treatmentPolicy: {
      nextAction: 'Validar carteira, produto, funding, política de crédito, cobrança e ritmo de contratação.',
      qualificationUse: 'Conjunto de vagas estratégicas confirma construção de infraestrutura de crédito/funding e reforça necessidade estrutural.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'investor_relationship_signal',
    signalFamily: 'capital_network',
    strengthFloor: 70,
    confidenceDelta: 0.04,
    structuralScoreDelta: 1,
    timingScoreDelta: 2,
    executabilityScoreDelta: 5,
    patternTags: ['governance_signal', 'growth_without_funding'],
    treatmentPolicy: {
      nextAction: 'Abrir o grafo investidor↔empresa, identificar introduções possíveis e histórico de follow-ons.',
      qualificationUse: 'Melhora executabilidade comercial e contexto de capital; não deve sozinho elevar necessidade de dívida.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'fidc_funding_event',
    signalFamily: 'capital_structure',
    strengthFloor: 90,
    confidenceDelta: 0.08,
    structuralScoreDelta: 10,
    timingScoreDelta: 10,
    executabilityScoreDelta: 10,
    patternTags: ['receivables_strong', 'capital_structure', 'fidc_fit'],
    treatmentPolicy: {
      nextAction: 'Mapear veículo/FIDC atual, investidores, tamanho, prazo, lastro, custo e espaço para resize, refinanciamento ou novo warehouse.',
      qualificationUse: 'Confirma uso real de funding estruturado e alta executabilidade para tese FIDC/DCM; priorizar leitura de capacidade incremental.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'structured_debt_funding',
    signalFamily: 'capital_structure',
    strengthFloor: 85,
    confidenceDelta: 0.06,
    structuralScoreDelta: 7,
    timingScoreDelta: 9,
    executabilityScoreDelta: 8,
    patternTags: ['capital_structure', 'capital_mismatch'],
    treatmentPolicy: {
      nextAction: 'Mapear instrumento, credores, custo, prazo, amortização, covenants e janela de refinanciamento.',
      qualificationUse: 'Confirma disposição e capacidade de usar dívida; reforça abordagem de refinanciamento, alongamento ou funding incremental.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'credit_origination_acceleration',
    signalFamily: 'receivables',
    strengthFloor: 80,
    confidenceDelta: 0.06,
    structuralScoreDelta: 10,
    timingScoreDelta: 8,
    executabilityScoreDelta: 6,
    patternTags: ['receivables_strong', 'expansion_outpacing_capital'],
    treatmentPolicy: {
      nextAction: 'Quantificar originação, carteira, prazo médio, funding disponível e necessidade marginal de capital.',
      qualificationUse: 'Aceleração de originação pode ampliar funding gap e reforçar tese de FIDC/warehouse quando a carteira for estruturável.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'vc_portfolio_signal',
    signalFamily: 'growth',
    strengthFloor: 76,
    confidenceDelta: 0.05,
    structuralScoreDelta: 3,
    timingScoreDelta: 8,
    executabilityScoreDelta: 4,
    patternTags: ['growth_without_funding', 'expansion_outpacing_capital'],
    treatmentPolicy: {
      nextAction: 'Identificar investidor, estágio, data e probabilidade de follow-on.',
      qualificationUse: 'Sobe timing quando evento de funding/crescimento é recente.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'financial_infrastructure_signal',
    signalFamily: 'embedded_finance',
    strengthFloor: 80,
    confidenceDelta: 0.06,
    structuralScoreDelta: 8,
    timingScoreDelta: 5,
    executabilityScoreDelta: 6,
    patternTags: ['embedded_finance_pressure', 'credit_is_core'],
    treatmentPolicy: {
      nextAction: 'Validar autorização, papel regulado e ativo financeiro gerado.',
      qualificationUse: 'Sobe necessidade estrutural se a empresa opera infraestrutura financeira.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'technical_product_signal',
    signalFamily: 'product',
    strengthFloor: 70,
    confidenceDelta: 0.03,
    structuralScoreDelta: 4,
    timingScoreDelta: 4,
    executabilityScoreDelta: 2,
    patternTags: ['product_launch', 'embedded_finance_pressure'],
    treatmentPolicy: {
      nextAction: 'Validar repositório, documentação pública e produto financeiro exposto.',
      qualificationUse: 'Corrobora maturidade técnica e produto financeiro público.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'market_education_signal',
    signalFamily: 'timing',
    strengthFloor: 68,
    confidenceDelta: 0.02,
    structuralScoreDelta: 2,
    timingScoreDelta: 5,
    executabilityScoreDelta: 1,
    patternTags: ['timing_trigger', 'product_launch'],
    treatmentPolicy: {
      nextAction: 'Registrar tese comunicada, decisores envolvidos e audiência-alvo.',
      qualificationUse: 'Sinal fraco de timing; precisa de corroboração.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'public_financing_signal',
    signalFamily: 'capital_structure',
    strengthFloor: 76,
    confidenceDelta: 0.03,
    structuralScoreDelta: 5,
    timingScoreDelta: 4,
    executabilityScoreDelta: 4,
    patternTags: ['capital_structure', 'funding_gap'],
    treatmentPolicy: {
      nextAction: 'Validar produto BNDES/Finep, valor, prazo, garantias e complementaridade DCM.',
      qualificationUse: 'Mapeia funding existente e ângulo de refinanciamento/alongamento.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'international_receivables_signal',
    signalFamily: 'receivables',
    strengthFloor: 70,
    confidenceDelta: 0.03,
    structuralScoreDelta: 6,
    timingScoreDelta: 3,
    executabilityScoreDelta: 4,
    patternTags: ['receivables_strong', 'capital_mismatch'],
    treatmentPolicy: {
      nextAction: 'Validar exposição cambial, prazo de recebimento e carteira de compradores.',
      qualificationUse: 'Abre tese de recebíveis internacionais e working capital exportador.',
      riskDisposition: 'positive',
    },
  },
  {
    signalType: 'product_expansion_signal',
    signalFamily: 'expansion',
    strengthFloor: 66,
    confidenceDelta: 0.02,
    structuralScoreDelta: 2,
    timingScoreDelta: 4,
    executabilityScoreDelta: 1,
    patternTags: ['expansion', 'timing_trigger'],
    treatmentPolicy: {
      nextAction: 'Validar classe, titularidade, data e relação com produto financeiro.',
      qualificationUse: 'Sinal fraco de expansão/maturidade; precisa de corroboração.',
      riskDisposition: 'positive',
    },
  },
];

const ruleBySignalType = new Map(SOURCE_TREATMENT_RULES.map((rule) => [rule.signalType, rule]));

export const sourceTreatmentRuleForSignal = (signalType: string) => ruleBySignalType.get(signalType);

export const computeSourceTreatmentImpact = (signals: SignalView[]): SourceTreatmentImpact => {
  const applied = signals.flatMap((signal): AppliedSourceTreatment[] => {
    const rule = sourceTreatmentRuleForSignal(signal.type);
    if (!rule) return [];

    const passesStrengthFloor = signal.strength >= rule.strengthFloor;
    const appliedStructuralDelta = passesStrengthFloor ? rule.structuralScoreDelta : 0;
    const appliedTimingDelta = passesStrengthFloor ? rule.timingScoreDelta : 0;
    const appliedExecutabilityDelta = passesStrengthFloor ? rule.executabilityScoreDelta : 0;

    return [{
      ...rule,
      signalSource: signal.source,
      signalStrength: signal.strength,
      confidenceScore: signal.confidence,
      note: signal.note,
      appliedStructuralDelta,
      appliedTimingDelta,
      appliedExecutabilityDelta,
    }];
  });

  const actionable = applied.filter((item) => item.signalStrength >= item.strengthFloor);
  const structuralScoreDelta = cap(actionable.reduce((sum, item) => sum + item.appliedStructuralDelta, 0), -15, 22);
  const timingScoreDelta = cap(actionable.reduce((sum, item) => sum + item.appliedTimingDelta, 0), -10, 24);
  const executabilityScoreDelta = cap(actionable.reduce((sum, item) => sum + item.appliedExecutabilityDelta, 0), -25, 16);

  return {
    treatedSignalsCount: applied.length,
    actionableSignalsCount: actionable.length,
    structuralScoreDelta,
    timingScoreDelta,
    executabilityScoreDelta,
    totalTreatmentDelta: structuralScoreDelta + timingScoreDelta + executabilityScoreDelta,
    maxSignalStrength: applied.length ? Math.max(...applied.map((item) => item.signalStrength)) : 0,
    avgConfidenceScore: Number(avg(applied.map((item) => item.confidenceScore)).toFixed(2)),
    signalTypes: uniq(applied.map((item) => item.signalType)),
    signalFamilies: uniq(applied.map((item) => item.signalFamily)),
    patternTags: uniq(applied.flatMap((item) => item.patternTags)),
    positiveSignals: uniq(applied.filter((item) => item.treatmentPolicy.riskDisposition === 'positive').map((item) => item.signalType)),
    riskSignals: uniq(applied.filter((item) => item.treatmentPolicy.riskDisposition !== 'positive').map((item) => item.signalType)),
    nextActions: uniq(actionable.map((item) => item.treatmentPolicy.nextAction)),
    applied,
  };
};

export const hasTreatmentTag = (impact: SourceTreatmentImpact, tag: string) => impact.patternTags.includes(tag);
