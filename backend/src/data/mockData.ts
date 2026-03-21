import { computeLeadScore } from '../lib/scoring';
import { agentDefinitions, topPatterns } from '../modules/agents';
import type { Company } from '../types/domain';

const leadBase = [
  {
    id: 'cmp_neon_receivables',
    name: 'Neon Receivables',
    segment: 'Fintech',
    subsegment: 'Crédito consignado B2B2C',
    geography: 'Brasil',
    product: 'Antecipação de recebíveis',
    receivables: ['Cartão', 'Folha'],
    qualificationScore: 88,
    monitoringStatus: 'active',
    suggestedStructure: 'FIDC',
    thesis: 'Base recorrente de recebíveis e expansão acelerada indicam fit para FIDC com warehouse inicial.',
    nextAction: 'Agendar abordagem sobre funding escalável e segregação de risco.',
    metrics: { sourceConfidence: 0.82, triggerStrength: 87, timingIntensity: 91, executionReadiness: 78, dataQuality: 83, pipelineReadiness: 70 },
  },
  {
    id: 'cmp_orbit_pay',
    name: 'Orbit Pay',
    segment: 'Embedded Finance',
    subsegment: 'Payment + Crédito para SMB',
    geography: 'Brasil',
    product: 'Capital de giro',
    receivables: ['Assinaturas', 'Cartão'],
    qualificationScore: 76,
    monitoringStatus: 'watch',
    suggestedStructure: 'Nota comercial',
    thesis: 'Crescimento comercial gera pressão de balanço; bridge via NC e trilha para debênture privada.',
    nextAction: 'Validar maturidade de governança e stack de cobrança.',
    metrics: { sourceConfidence: 0.75, triggerStrength: 71, timingIntensity: 73, executionReadiness: 65, dataQuality: 80, pipelineReadiness: 62 },
  },
  {
    id: 'cmp_axon_health',
    name: 'Axon Health Credit',
    segment: 'Healthtech',
    subsegment: 'Parcelamento médico',
    geography: 'Brasil',
    product: 'BNPL',
    receivables: ['Mensalidades', 'Duplicatas'],
    qualificationScore: 69,
    monitoringStatus: 'active',
    suggestedStructure: 'Debênture',
    thesis: 'Produto de crédito já core, mas governança ainda parcial; debênture privada pode alongar passivo antes de FIDC.',
    nextAction: 'Monitorar expansão regional e qualidade da esteira de underwriting.',
    metrics: { sourceConfidence: 0.71, triggerStrength: 67, timingIntensity: 60, executionReadiness: 59, dataQuality: 74, pipelineReadiness: 64 },
  },
];

export const companies: Company[] = leadBase.map((item) => {
  const lead = computeLeadScore(item.metrics);
  return { ...item, leadScore: lead.score, leadBucket: lead.bucket };
});

export const searchProfiles = [
  {
    id: 'sp_growth_fidc',
    name: 'Fintech growth com recebíveis',
    segment: 'Fintech',
    subsegment: 'Lending e embedded finance',
    companyType: 'Scale-up',
    geography: 'Brasil',
    creditProduct: 'Antecipação de recebíveis',
    receivables: ['Cartão', 'Duplicatas'],
    targetStructure: 'FIDC',
    minimumSignalIntensity: 65,
    minimumConfidence: 0.7,
    timeWindowDays: 120,
  }
];

export const dashboardSummary = {
  monitoredCompanies: 148,
  newLeads: 19,
  immediatePriority: 12,
  activeAgents: 9,
  detectedPatterns: 27,
  pipelineValue: 'R$ 480 mi',
  charts: {
    leadsByPriority: [
      { label: 'Immediate', value: 12 },
      { label: 'High', value: 34 },
      { label: 'Monitor', value: 41 },
      { label: 'Watchlist', value: 28 },
    ],
    monitoringVelocity: [46, 51, 49, 63, 70, 74],
  },
};

export const sources = [
  { id: 'src_cvm_rss', name: 'CVM RSS', type: 'rss', category: 'Regulatório', status: 'partial', health: 'healthy' },
  { id: 'src_google_news', name: 'Google News RSS', type: 'rss', category: 'News/RSS', status: 'real', health: 'healthy' },
  { id: 'src_linkedin', name: 'LinkedIn Hiring Signals', type: 'scraper', category: 'Digital signals', status: 'mock', health: 'degraded' },
  { id: 'src_site_monitor', name: 'Website Monitoring', type: 'sitemap', category: 'Website monitoring', status: 'partial', health: 'healthy' },
];

export const pipeline = [
  { stage: 'Identified', count: 32 },
  { stage: 'Qualified', count: 17 },
  { stage: 'Approach', count: 9 },
  { stage: 'Structuring', count: 4 },
];

export const activities = [
  { id: 'act_1', companyId: 'cmp_neon_receivables', title: 'Preparar tese FIDC', owner: 'Origination', dueDate: '2026-03-25', status: 'open' },
  { id: 'act_2', companyId: 'cmp_orbit_pay', title: 'Call com CFO', owner: 'Coverage', dueDate: '2026-03-27', status: 'planned' },
];

export const tasks = [
  { id: 'tsk_1', title: 'Validar webhook Supabase', status: 'todo' },
  { id: 'tsk_2', title: 'Abrir backlog de conector Bacen', status: 'in_progress' },
];

export const companyDetails = Object.fromEntries(
  companies.map((company) => [
    company.id,
    {
      company,
      qualification: {
        has_credit_product: true,
        credit_product_type: company.product,
        credit_is_core_product: true,
        has_receivables: true,
        receivables_type: company.receivables,
        receivables_recurrence_level: 'high',
        receivables_predictability_level: 'medium_high',
        has_fidc: false,
        has_securitization_structure: false,
        has_existing_debt_structure: company.suggestedStructure !== 'FIDC',
        funding_structure_type: company.suggestedStructure,
        capital_structure_quality: 'partial',
        capital_structure_rationale: 'Crescimento pressiona funding e balanço próprio.',
        funding_gap_level: 'high',
        capital_dependency_level: 'high',
        growth_vs_funding_mismatch: 'elevated',
        fit_fidc: company.suggestedStructure === 'FIDC',
        fit_dcm: ['Debênture', 'Nota comercial'].includes(company.suggestedStructure),
        fit_other_structure: company.suggestedStructure,
        governance_maturity_level: 'medium',
        risk_model_maturity_level: 'medium',
        underwriting_maturity_level: 'medium',
        operational_maturity_level: 'medium_high',
        unit_economics_quality: 'positive',
        spread_vs_funding_quality: 'healthy',
        concentration_risk_level: 'medium',
        delinquency_signal_level: 'low',
        timing_intensity_level: 'high',
        execution_readiness_level: 'medium_high',
        qualification_score_structural: Math.round(company.qualificationScore * 0.2),
        qualification_score_capital: Math.round(company.qualificationScore * 0.25),
        qualification_score_receivables: Math.round(company.qualificationScore * 0.2),
        qualification_score_execution: Math.round(company.qualificationScore * 0.2),
        qualification_score_timing: Math.round(company.qualificationScore * 0.15),
        qualification_score_total: company.qualificationScore,
        confidence_score: 0.78,
        rationale_summary: company.thesis,
        evidence_payload: { signals: ['expansão', 'contratações em crédito', 'base de recebíveis recorrente'] },
        predicted_funding_need_score: 82,
        urgency_score: 79,
        suggested_structure_type: company.suggestedStructure,
      },
      patterns: topPatterns.slice(0, 3).map((pattern, index) => ({ id: `${company.id}_${index}`, pattern, confidence: 0.7 + index * 0.08 })),
      thesis: { summary: company.thesis, marketMap: 'Benchmark com pares de crédito lastreado e embedded finance.' },
      sources,
      monitoring: { lastRunAt: '2026-03-21T09:30:00Z', outputs: 18, triggers: 5 },
      activities: activities.filter((activity) => activity.companyId === company.id),
      scores: { qualification: company.qualificationScore, lead: company.leadScore, bucket: company.leadBucket },
    },
  ]),
);

export const statusMatrix = {
  auth: 'mock',
  dashboard: 'real',
  companies: 'real',
  qualification: 'real',
  leadScore: 'real',
  sources: 'partial',
  monitoring: 'partial',
  agents: 'real',
  pipeline: 'partial',
  frontendDataFallback: 'mock',
};

export const agentRuns = companies.map((company, index) => ({
  id: `run_${index + 1}`,
  execution_id: `exec_${index + 1}`,
  agent_name: 'qualification_agent',
  company_id: company.id,
  status: 'completed',
  started_at: '2026-03-21T09:00:00Z',
  finished_at: '2026-03-21T09:01:00Z',
  input_summary: 'Cadastro + sinais + enriquecimento',
  output_summary: `Qualification score ${company.qualificationScore}`,
  validation_result: 'passed',
  confidence: 0.78,
  quality: 0.81,
  error_details: null,
}));

export const agentPayload = { definitions: agentDefinitions, runs: agentRuns };
