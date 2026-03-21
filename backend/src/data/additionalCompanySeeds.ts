import type { CompanySeed } from '../types/platform.js';

const makeCompanySeed = ({
  id,
  legalName,
  tradeName,
  cnpj,
  website,
  segment,
  subsegment,
  companyType,
  stage,
  creditProduct,
  receivables,
  currentFundingStructure,
  description,
  signals,
  sourceConfidence,
  marketMapPeers,
  activities,
}: {
  id: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  website: string;
  segment: string;
  subsegment: string;
  companyType: string;
  stage: string;
  creditProduct: string;
  receivables: string[];
  currentFundingStructure: string;
  description: string;
  signals: CompanySeed['signals'];
  sourceConfidence: number;
  marketMapPeers: CompanySeed['marketMapPeers'];
  activities: CompanySeed['activities'];
}): CompanySeed => ({
  id,
  legalName,
  tradeName,
  cnpj,
  website,
  geography: 'Brasil',
  segment,
  subsegment,
  companyType,
  stage,
  creditProduct,
  receivables,
  currentFundingStructure,
  description,
  signals,
  monitoring: {
    status: 'active',
    lastRunAt: '2026-03-21T09:20:00Z',
    outputs24h: signals.length * 3,
    triggers24h: signals.filter((signal) => signal.strength >= 65).length,
    websiteChanges: signals.slice(0, 2).map((signal) => signal.note),
    feedHighlights: signals.slice(0, 2).map((signal) => signal.note),
  },
  enrichment: {
    governanceMaturity: 'medium',
    underwritingMaturity: 'medium',
    operationalMaturity: 'medium_high',
    riskModelMaturity: 'medium',
    unitEconomicsQuality: 'mixed',
    spreadVsFundingQuality: 'neutral',
    concentrationRisk: 'medium',
    delinquencySignal: 'low',
    sourceConfidence,
    sourceNotes: ['Seed complementar para acelerar carga inicial no Supabase com dados realistas.'],
  },
  sourceRecords: [
    { sourceId: 'src_brasilapi_cnpj', externalId: cnpj, observedAt: '2026-03-20T08:00:00Z', payload: { seeded: true } },
    { sourceId: 'src_company_website', externalId: `${id}_homepage`, observedAt: '2026-03-21T07:00:00Z', payload: { seeded: true } },
  ],
  marketMapPeers,
  activities,
});

export const additionalCompanySeeds: CompanySeed[] = [
  makeCompanySeed({
    id: 'cmp_arbo_pay', legalName: 'Arbo Pay Soluções Financeiras Ltda.', tradeName: 'Arbo Pay', cnpj: '13765432000110', website: 'https://www.arbopay.com.br', segment: 'Embedded Finance', subsegment: 'Crédito para lojistas', companyType: 'Growth', stage: 'Series A', creditProduct: 'Capital de giro embutido', receivables: ['Cartão', 'Boletos'], currentFundingStructure: 'Balanço próprio + nota comercial curta', description: 'Plataforma de pagamentos com oferta de capital de giro para base SME.', sourceConfidence: 0.76, signals: [{ type: 'embedded_finance_launch', strength: 78, confidence: 0.76, note: 'Nova oferta de capital de giro no checkout.', source: 'src_company_website' }, { type: 'expansion_announcement', strength: 72, confidence: 0.74, note: 'Expansão da base de parceiros em varejo.', source: 'src_google_news_rss' }], marketMapPeers: [{ peerName: 'Orbit Pay', peerType: 'Embedded lender', rationale: 'Comparável por distribuição via pagamentos.' }], activities: [{ title: 'Validar política de capital de giro', owner: 'Coverage', status: 'open', dueDate: '2026-04-03' }]}),
  makeCompanySeed({
    id: 'cmp_cedro_saude', legalName: 'Cedro Saúde Crédito Ltda.', tradeName: 'Cedro Saúde', cnpj: '20987654000144', website: 'https://www.cedrosaude.com.br', segment: 'Healthtech', subsegment: 'Parcelamento e recorrência médica', companyType: 'Growth', stage: 'Series A', creditProduct: 'Parcelamento médico', receivables: ['Mensalidades', 'Cartão'], currentFundingStructure: 'Linhas bilaterais + caixa', description: 'Healthtech com carteira recorrente de parcelamento clínico.', sourceConfidence: 0.72, signals: [{ type: 'regional_expansion', strength: 69, confidence: 0.72, note: 'Entrada em novas clínicas no Sul.', source: 'src_google_news_rss' }, { type: 'receivables_velocity', strength: 75, confidence: 0.7, note: 'Crescimento da recorrência de mensalidades.', source: 'src_company_website' }], marketMapPeers: [{ peerName: 'Axon Health Credit', peerType: 'Health BNPL', rationale: 'Benchmark setorial.' }], activities: [{ title: 'Rodar triagem de estrutura de recebíveis', owner: 'Analytics', status: 'planned', dueDate: '2026-04-04' }]}),
  makeCompanySeed({
    id: 'cmp_nexo_log', legalName: 'Nexo Log Finance S.A.', tradeName: 'Nexo Log', cnpj: '30876543000155', website: 'https://www.nexolog.com.br', segment: 'Logistics', subsegment: 'Frete e capital de giro', companyType: 'Scale-up', stage: 'Series B', creditProduct: 'Antecipação a transportadoras', receivables: ['Duplicatas', 'Frete'], currentFundingStructure: 'Warehouse tático', description: 'Operação logística com funding para cadeia de frete e recebíveis B2B.', sourceConfidence: 0.79, signals: [{ type: 'expansion_announcement', strength: 74, confidence: 0.77, note: 'Nova cobertura para corredores interestaduais.', source: 'src_google_news_rss' }, { type: 'warehouse_need', strength: 81, confidence: 0.78, note: 'Demanda crescente por funding para frete.', source: 'src_company_website' }], marketMapPeers: [{ peerName: 'Freight Capital', peerType: 'Receivables lender', rationale: 'Recebíveis B2B de logística.' }], activities: [{ title: 'Analisar elegibilidade de duplicatas', owner: 'Origination', status: 'open', dueDate: '2026-04-05' }]}),
  makeCompanySeed({
    id: 'cmp_lumen_edu', legalName: 'Lumen Educação Financeira Ltda.', tradeName: 'Lumen Edu', cnpj: '11456789000123', website: 'https://www.lumenedu.com.br', segment: 'Edtech', subsegment: 'Mensalidades parceladas', companyType: 'Growth', stage: 'Series A', creditProduct: 'Crédito estudantil', receivables: ['Mensalidades', 'Boletos'], currentFundingStructure: 'Balanço próprio', description: 'Edtech com carteira parcelada e pagamentos recorrentes.', sourceConfidence: 0.7, signals: [{ type: 'receivables_velocity', strength: 73, confidence: 0.71, note: 'Aumento da base de mensalidades financiadas.', source: 'src_company_website' }, { type: 'hiring_credit', strength: 67, confidence: 0.66, note: 'Contratação de analista de crédito educacional.', source: 'src_company_website' }], marketMapPeers: [{ peerName: 'Tuition Capital', peerType: 'Education receivables', rationale: 'Benchmark de FIDC de mensalidades.' }], activities: [{ title: 'Estruturar nota sobre funding educacional', owner: 'Origination', status: 'open', dueDate: '2026-04-07' }]}),
  makeCompanySeed({
    id: 'cmp_verde_agro', legalName: 'Verde Agro Capital Ltda.', tradeName: 'Verde Agro', cnpj: '42999888000166', website: 'https://www.verdeagro.com.br', segment: 'Agfintech', subsegment: 'Crédito para insumos', companyType: 'Scale-up', stage: 'Series B', creditProduct: 'Crédito de safra', receivables: ['CPR', 'Duplicatas'], currentFundingStructure: 'Balanço próprio + linhas bilaterais', description: 'Agfintech com crédito para insumos e recebíveis do agronegócio.', sourceConfidence: 0.81, signals: [{ type: 'expansion_announcement', strength: 80, confidence: 0.8, note: 'Entrada em novos polos agrícolas.', source: 'src_google_news_rss' }, { type: 'balance_sheet_pressure', strength: 77, confidence: 0.79, note: 'Pressão de funding no ciclo de safra.', source: 'src_company_website' }], marketMapPeers: [{ peerName: 'Agro FIDC Prime', peerType: 'Agro receivables', rationale: 'Comparável por lastro em CPR.' }], activities: [{ title: 'Validar esteira documental CPR', owner: 'Analytics', status: 'planned', dueDate: '2026-04-08' }]}),
  makeCompanySeed({
    id: 'cmp_prisma_auto', legalName: 'Prisma Auto Finance Ltda.', tradeName: 'Prisma Auto', cnpj: '36789012000145', website: 'https://www.prismaauto.com.br', segment: 'Mobility', subsegment: 'Financiamento automotivo leve', companyType: 'Growth', stage: 'Series A', creditProduct: 'Parcelamento automotivo', receivables: ['Parcelas', 'Duplicatas'], currentFundingStructure: 'Debênture privada piloto', description: 'Plataforma de mobilidade com financiamento leve e cobrança digital.', sourceConfidence: 0.74, signals: [{ type: 'underwriting_story', strength: 70, confidence: 0.72, note: 'Narrativa pública de aprimoramento de underwriting.', source: 'src_company_website' }, { type: 'regional_expansion', strength: 71, confidence: 0.7, note: 'Expansão da rede de lojas parceiras.', source: 'src_google_news_rss' }], marketMapPeers: [{ peerName: 'Auto Parcel', peerType: 'Auto credit', rationale: 'Benchmark de carteira parcelada automotiva.' }], activities: [{ title: 'Revisar fit com estrutura privada', owner: 'Coverage', status: 'open', dueDate: '2026-04-09' }]}),
  makeCompanySeed({
    id: 'cmp_safra_shop', legalName: 'Safra Shop Finance Ltda.', tradeName: 'Safra Shop', cnpj: '55667788000190', website: 'https://www.safrashop.com.br', segment: 'Retail Tech', subsegment: 'Embedded lending para sellers', companyType: 'Scale-up', stage: 'Series B', creditProduct: 'Antecipação para sellers', receivables: ['Cartão', 'Pix parcelado'], currentFundingStructure: 'Caixa + linhas bilaterais', description: 'Marketplace com oferta embutida de crédito e antecipação para sellers.', sourceConfidence: 0.8, signals: [{ type: 'embedded_finance_launch', strength: 83, confidence: 0.81, note: 'Nova frente de crédito no portal do seller.', source: 'src_company_website' }, { type: 'expansion_announcement', strength: 76, confidence: 0.79, note: 'Programa expandido para novos sellers.', source: 'src_google_news_rss' }], marketMapPeers: [{ peerName: 'Arbo Pay', peerType: 'Embedded finance', rationale: 'Comparável em distribuição SMB.' }], activities: [{ title: 'Mapear necessidade de warehouse inicial', owner: 'Origination', status: 'planned', dueDate: '2026-04-10' }]}),
];
