export type DcmDailyLeadPriority = 'A' | 'B' | 'C' | 'Reciclar';
export type DcmOutreachStatus = 'draft' | 'ready' | 'sent' | 'repositioned' | 'do_not_advance' | 'missing_data';

export type DcmDailyWorkflowStage = {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  name: string;
  objective: string;
  inputs: string[];
  actions: string[];
  outputs: string[];
};

export const businessAnalystAgent = {
  id: 'business-analyst',
  name: 'Business Analyst Agent',
  canonicalSpec: 'spec/platform/agents/business-analyst.md',
  mode: 'read-only' as const,
  audience: 'business' as const,
  objective: 'Transformar uma demanda bruta em intake estruturado antes de produto, análise ou implementação.',
  inputs: ['demanda', 'objetivo', 'stakeholders', 'restrições conhecidas', 'resultado esperado'],
  outputs: ['intake estruturado', 'open questions', 'riscos', 'critérios de aceite', 'handoff para Product/Analyst'],
  limits: [
    'sem shell mutante',
    'sem leitura de segredos',
    'sem alteração de produção',
    'sem afirmar requisito não validado',
  ],
  handoff: 'Product/Analyst recebe o problema estruturado, evidências, lacunas, riscos e critérios de aceite.',
};

export const outreachWritingRules = [
  'Começar com uma observação concreta sobre a empresa, produto, operação ou trigger.',
  'Usar linguagem humana, direta, consultiva e próxima da fala cotidiana.',
  'Trabalhar com apenas uma hipótese de produto por mensagem.',
  'Não prometer preço, taxa, prazo, volume, aprovação ou fechamento.',
  'Manter a mensagem inicial em aproximadamente cinco ou seis linhas.',
  'Evitar travessões e blocos institucionais longos.',
  'Usar a apresentação curta: Faço parte do time de DCM aqui da SRM.',
  'Explicar o produto em linguagem simples, ligado à dor provável.',
  'Encerrar com CTA leve para uma conversa de aproximadamente vinte minutos.',
] as const;

export const salesSkillCatalog = [
  {
    stage: 'abertura',
    skills: ['pesquisa contextual', 'observação específica', 'warm intro', 'credibilidade sem institucional excessivo'],
  },
  {
    stage: 'descoberta',
    skills: ['perguntas abertas', 'escuta ativa', 'diagnóstico de funding', 'mapeamento de recebíveis', 'identificação de timing'],
  },
  {
    stage: 'qualificação',
    skills: ['fit FIDC/DCM', 'funding gap', 'executabilidade', 'stakeholders', 'próxima ação objetiva'],
  },
  {
    stage: 'follow-up',
    skills: ['retomada contextual', 'novo trigger', 'redução de fricção', 'CTA único', 'reciclagem disciplinada'],
  },
] as const;

export const dailyDcmLeadWorkflow: {
  objective: string;
  stages: DcmDailyWorkflowStage[];
  completionCriteria: string[];
} = {
  objective: 'Transformar ranking, sinais e teses em abordagens DCM executáveis, registradas e capazes de gerar aprendizado institucional.',
  stages: [
    {
      id: 'A',
      name: 'Novos leads',
      objective: 'Selecionar novos contatos com evidência suficiente para abordagem.',
      inputs: ['ranking_v2', 'lead_score_snapshots', 'qualification_snapshots', 'company_signals', 'thesis_outputs'],
      actions: ['selecionar prioridades A/B', 'validar empresa e contato', 'definir uma hipótese de produto', 'registrar fonte e próxima ação'],
      outputs: ['lead diário', 'tese curta', 'produto hipótese', 'status draft ou missing_data'],
    },
    {
      id: 'B',
      name: 'Leads com tese sem mensagem',
      objective: 'Converter tese aprovada em mensagem pronta para revisão e envio.',
      inputs: ['lead diário', 'tese', 'contato', 'trigger', 'writing rules'],
      actions: ['gerar mensagem', 'validar um produto', 'remover promessas', 'validar CTA e tamanho'],
      outputs: ['generated_message', 'status ready', 'skills recomendadas'],
    },
    {
      id: 'C',
      name: 'Briefing diário',
      objective: 'Consolidar prioridades comerciais e pendências do dia.',
      inputs: ['pipeline', 'activities', 'tasks', 'dcm_daily_leads', 'monitoring triggers'],
      actions: ['listar ações vencidas', 'ordenar leads por prioridade', 'destacar novos triggers', 'separar feedbacks pendentes'],
      outputs: ['prioridade do dia', 'leads para abordar', 'ações vencidas', 'alertas'],
    },
    {
      id: 'D',
      name: 'Sincronização do pipeline',
      objective: 'Manter inteligência, abordagem e execução comercial no mesmo estado.',
      inputs: ['mensagens enviadas', 'respostas', 'reuniões', 'próximas ações'],
      actions: ['registrar envio', 'atualizar etapa', 'criar atividade', 'criar tarefa', 'reciclar quando aplicável'],
      outputs: ['pipeline atualizado', 'activity', 'task', 'next_action'],
    },
    {
      id: 'E',
      name: 'Skills de venda',
      objective: 'Entregar apoio contextual de acordo com o estágio comercial do lead.',
      inputs: ['etapa do pipeline', 'persona', 'objeção', 'produto hipótese'],
      actions: ['selecionar skill', 'sugerir perguntas', 'sugerir abordagem', 'registrar risco de conversa'],
      outputs: ['recommended_skills', 'perguntas de descoberta', 'CTA sugerido'],
    },
    {
      id: 'F',
      name: 'Aprendizado de escrita',
      objective: 'Comparar mensagem gerada com mensagem realmente enviada e transformar diferenças em regra reutilizável.',
      inputs: ['generated_message', 'actual_message', 'resultado da abordagem'],
      actions: ['detectar alterações', 'resumir mudança', 'propor regra', 'submeter para revisão humana'],
      outputs: ['feedback de escrita', 'learned_rules', 'status pending/reviewed/applied'],
    },
  ],
  completionCriteria: [
    'Todo lead possui empresa, contato, hipótese de produto, tese, prioridade, fonte e próxima ação.',
    'Toda mensagem pronta respeita os guardrails de escrita.',
    'Todo envio atualiza pipeline, atividade ou tarefa.',
    'Toda alteração material feita pelo usuário gera feedback comparável.',
    'Nenhum lead é duplicado no mesmo dia para a mesma empresa e URL de contato.',
  ],
};

export const dailyLeadOutputContract = {
  requiredFields: [
    'companyId',
    'contactName',
    'contactRole',
    'linkedinUrl',
    'productHypothesis',
    'priority',
    'thesis',
    'outreachStatus',
    'sourceTrace',
    'nextAction',
  ],
  statuses: ['draft', 'ready', 'sent', 'repositioned', 'do_not_advance', 'missing_data'] as DcmOutreachStatus[],
  deduplicationKeys: ['company_id', 'linkedin_url', 'generated_on'],
  persistence: ['dcm_daily_leads', 'dcm_outreach_feedback', 'pipeline', 'activities', 'tasks'],
};

export const getBusinessAnalystAgent = () => businessAnalystAgent;

export const getDcmDailyOperatingLoop = () => ({
  version: '2026.07.24',
  objective: dailyDcmLeadWorkflow.objective,
  workflow: dailyDcmLeadWorkflow,
  writingRules: outreachWritingRules,
  salesSkills: salesSkillCatalog,
  outputContract: dailyLeadOutputContract,
  affectedModules: [
    'companies',
    'company_signals',
    'qualification_snapshots',
    'lead_score_snapshots',
    'thesis_outputs',
    'ranking_v2',
    'pipeline',
    'activities',
    'tasks',
  ],
});
