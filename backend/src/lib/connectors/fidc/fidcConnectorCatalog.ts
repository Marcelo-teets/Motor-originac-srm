export type FIDCConnectorCatalogEntry = {
  id: string;
  name: string;
  sourceType: 'dataset_api' | 'dataset_http' | 'api' | 'rpa_api';
  category: 'FIDC' | 'Fundos estruturados' | 'Regulatório' | 'Prestadores' | 'Setor público';
  status: 'real' | 'partial' | 'planned';
  authRequirement?: string;
  notes: string;
  baseUrl?: string;
};

export const fidcConnectorCatalog: FIDCConnectorCatalogEntry[] = [
  {
    id: 'src_cvm_fidc_monthly',
    name: 'CVM FIDC Informes Mensais',
    sourceType: 'dataset_api',
    category: 'FIDC',
    status: 'real',
    notes: 'Ingestão pública operacional no pipeline de mercado de capitais, com seleção por competência, checkpoints e lineage persistido.',
    baseUrl: 'https://dados.cvm.gov.br/dataset/fidc-doc-inf_mensal',
  },
  {
    id: 'src_cvm_fund_registry',
    name: 'CVM Cadastro de Fundos Classes e Subclasses',
    sourceType: 'dataset_api',
    category: 'Regulatório',
    status: 'real',
    notes: 'Ingestão pública operacional no pipeline de mercado de capitais, com normalização cadastral e lineage persistido.',
    baseUrl: 'https://dados.cvm.gov.br/dataset/fi-cad',
  },
  {
    id: 'src_cvm_fundos_estruturados_medidas',
    name: 'CVM Fundos Estruturados: Medidas',
    sourceType: 'dataset_http',
    category: 'Fundos estruturados',
    status: 'partial',
    notes: 'Fonte oficial catalogada para medidas agregadas; loader e persistência ainda estão pendentes.',
    baseUrl: 'https://dados.cvm.gov.br/dataset/fie-medidas',
  },
  {
    id: 'src_cvm_fundos_documentos_entrega',
    name: 'CVM Fundos de Investimento: Documentos: Entrega',
    sourceType: 'dataset_http',
    category: 'Regulatório',
    status: 'partial',
    notes: 'Fonte oficial catalogada para completude de disclosure; loader e persistência ainda estão pendentes.',
    baseUrl: 'https://dados.cvm.gov.br/dataset/fi-doc-entrega',
  },
  {
    id: 'src_anbima_fundos_estruturados',
    name: 'ANBIMA API Fundos Estruturados',
    sourceType: 'api',
    category: 'Fundos estruturados',
    status: 'partial',
    authRequirement: 'client credentials / token ANBIMA',
    notes: 'Conector implementado, mas a captura só é real quando o token ANBIMA estiver configurado. API REST com paginação para FIDC/FII/FIP, classes/séries, prestadores, ISIN, situação, restrições e contexto RCVM 175.',
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
