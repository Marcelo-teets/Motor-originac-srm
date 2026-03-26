export type FIDCConnectorCatalogEntry = {
  id: string;
  name: string;
  sourceType: 'dataset_http' | 'api' | 'rpa_api';
  category: 'FIDC' | 'Fundos estruturados' | 'Regulatório' | 'Prestadores' | 'Setor público';
  status: 'real' | 'partial' | 'planned';
  authRequirement?: string;
  notes: string;
  baseUrl?: string;
};

export const fidcConnectorCatalog: FIDCConnectorCatalogEntry[] = [
  {
    id: 'src_cvm_fidc_informe_mensal',
    name: 'CVM FIDC: Documentos: Informe Mensal',
    sourceType: 'dataset_http',
    category: 'FIDC',
    status: 'real',
    notes: 'Dataset mensal em ZIP no Portal de Dados Abertos da CVM. Deve ser tratado como dataset API com polling de recursos.',
    baseUrl: 'https://dados.cvm.gov.br/dataset/fidc-doc-inf_mensal',
  },
  {
    id: 'src_cvm_fundos_cadastral',
    name: 'CVM Fundos de Investimento: Informação Cadastral',
    sourceType: 'dataset_http',
    category: 'Regulatório',
    status: 'real',
    notes: 'Cadastro de fundos estruturados e não estruturados. Útil para identidade base do fundo e status cadastral.',
    baseUrl: 'https://dados.cvm.gov.br/dataset/?q=fundos+de+investimento',
  },
  {
    id: 'src_cvm_fundos_estruturados_medidas',
    name: 'CVM Fundos Estruturados: Medidas',
    sourceType: 'dataset_http',
    category: 'Fundos estruturados',
    status: 'real',
    notes: 'Medidas agregadas como patrimônio líquido e número de cotistas para fundos estruturados, incluindo FIDC.',
    baseUrl: 'https://dados.cvm.gov.br/dataset/?q=FIDC',
  },
  {
    id: 'src_cvm_fundos_documentos_entrega',
    name: 'CVM Fundos de Investimento: Documentos: Entrega',
    sourceType: 'dataset_http',
    category: 'Regulatório',
    status: 'real',
    notes: 'Metadados de entrega de documentos periódicos e eventuais. Útil para completude, monitoramento e qualidade de disclosure.',
    baseUrl: 'https://dados.cvm.gov.br/dataset/?q=fundos+de+investimento',
  },
  {
    id: 'src_anbima_fundos_estruturados',
    name: 'ANBIMA API Fundos Estruturados',
    sourceType: 'api',
    category: 'Fundos estruturados',
    status: 'real',
    authRequirement: 'client credentials / token ANBIMA',
    notes: 'API REST com paginação para FIDC/FII/FIP, classes/séries, prestadores, ISIN, situação, restrições e contexto RCVM 175.',
    baseUrl: 'https://api.anbima.com.br/feed/fundos/v1/fundos-estruturados',
  },
  {
    id: 'src_anbima_fundos_icvm_555',
    name: 'ANBIMA API Fundos ICVM 555',
    sourceType: 'api',
    category: 'Fundos estruturados',
    status: 'partial',
    authRequirement: 'client credentials / token ANBIMA',
    notes: 'Fonte complementar para cruzamentos de universo e alocação.',
    baseUrl: 'https://api.anbima.com.br/feed/fundos/v1/fundos',
  },
  {
    id: 'src_infosimples_cvm_participante',
    name: 'Infosimples API CVM Participante',
    sourceType: 'rpa_api',
    category: 'Prestadores',
    status: 'partial',
    authRequirement: 'token Infosimples',
    notes: 'Consulta pronta de participantes regulados da CVM por CNPJ/CPF/nome. Útil para KYC/KYP de prestadores.',
    baseUrl: 'https://infosimples.com/consultas/cvm-participante/',
  },
  {
    id: 'src_portal_transparencia_api',
    name: 'Portal da Transparência API',
    sourceType: 'api',
    category: 'Setor público',
    status: 'partial',
    authRequirement: 'token Portal da Transparência',
    notes: 'Usado para cruzar prestadores de FIDC com contratos, pagamentos e órgãos públicos.',
    baseUrl: 'https://portaldatransparencia.gov.br/api-de-dados',
  },
];
