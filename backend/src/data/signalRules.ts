export type SignalRule = {
  id: string;
  signalType: string;
  category: string;
  strength: number;
  confidence: number;
  keywords: string[];
  rationale: string;
  factMappings?: Array<{ factType: string; factKey: string }>;
};

export const signalRules: SignalRule[] = [
  {
    id: 'embedded-finance-pressure',
    signalType: 'embedded_finance_pressure',
    category: 'credit_product',
    strength: 82,
    confidence: 0.76,
    keywords: ['embedded finance', 'antecipação', 'parcelado', 'crédito para clientes', 'BNPL'],
    rationale: 'Indica pressão por funding em empresas que operam produto financeiro embutido.',
    factMappings: [
      { factType: 'credit_product', factKey: 'product_evidence' },
    ],
  },
  {
    id: 'receivables-strong',
    signalType: 'receivables_base_detected',
    category: 'receivables',
    strength: 78,
    confidence: 0.74,
    keywords: ['recebíveis', 'duplicatas', 'antecipação de recebíveis', 'boletos', 'cartão'],
    rationale: 'Captura indícios de base recebível potencialmente estruturável.',
    factMappings: [
      { factType: 'receivables', factKey: 'receivables_evidence' },
    ],
  },
  {
    id: 'growth-expansion',
    signalType: 'expansion_outpacing_capital',
    category: 'growth',
    strength: 75,
    confidence: 0.70,
    keywords: ['expansão', 'nova unidade', 'crescimento acelerado', 'novos mercados', 'triplicou'],
    rationale: 'Expansão forte pode gerar descasamento entre crescimento e capital disponível.',
    factMappings: [
      { factType: 'growth', factKey: 'expansion_signal' },
    ],
  },
  {
    id: 'funding-event',
    signalType: 'recent_funding_event',
    category: 'capital_structure',
    strength: 68,
    confidence: 0.83,
    keywords: ['rodada', 'series a', 'series b', 'venture debt', 'captou'],
    rationale: 'Eventos de funding ajudam a entender maturidade, backing e momento de capital.',
    factMappings: [
      { factType: 'funding', factKey: 'funding_event' },
    ],
  },
  {
    id: 'capital-mismatch',
    signalType: 'capital_mismatch',
    category: 'capital_structure',
    strength: 86,
    confidence: 0.69,
    keywords: ['capital de giro', 'pressão de caixa', 'alongamento', 'financiamento', 'capital'],
    rationale: 'Sinaliza possível mismatch entre necessidade operacional e funding atual.',
    factMappings: [
      { factType: 'capital_structure', factKey: 'capital_pressure' },
    ],
  },
  {
    id: 'fidc-evidence',
    signalType: 'fidc_reference_detected',
    category: 'funding_structure',
    strength: 64,
    confidence: 0.84,
    keywords: ['fidc', 'cedente', 'cotas subordinadas', 'lastro', 'direitos creditórios'],
    rationale: 'Referências explícitas a FIDC ajudam a mapear maturidade ou benchmark estrutural.',
    factMappings: [
      { factType: 'funding_structure', factKey: 'fidc_reference' },
    ],
  },
];

export const enrichmentFieldMap = {
  legalName: ['razao social', 'razão social'],
  tradeName: ['nome fantasia', 'marca'],
  mainCnae: ['cnae principal'],
  fundingEvidence: ['captou', 'rodada', 'funding'],
  creditProductEvidence: ['crédito', 'financiamento', 'antecipação'],
  receivablesEvidence: ['recebíveis', 'cartão', 'boletos'],
};
