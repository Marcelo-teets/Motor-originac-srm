import type { CompanySeed, SourceCatalogEntry } from '../types/platform.js';

type RuntimeSourceLike = SourceCatalogEntry & { runtimeCode: string };

export type SourceRssTarget = {
  source: RuntimeSourceLike;
  url: string;
};

type BuildRssUrl = (query: string) => string;

const companySearchTerms = (company: CompanySeed) => [
  company.tradeName,
  company.legalName,
  company.cnpj,
  company.segment,
  company.subsegment,
]
  .filter(Boolean)
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim();

const buildQueriesFor = (source: RuntimeSourceLike, company: CompanySeed): string[] => {
  const companyTerms = companySearchTerms(company);
  const tradeName = company.tradeName;
  const legalName = company.legalName;

  switch (source.runtimeCode) {
    case 'src_cvm_open_data_funds_offers':
    case 'src_cvm_rss':
      return [
        `${tradeName} CVM FIDC direitos creditórios`,
        `${legalName} oferta pública debênture nota comercial CVM`,
      ];

    case 'src_anbima_structured_funds':
      return [
        `${tradeName} ANBIMA FIDC fundo estruturado`,
        `${tradeName} administrador gestor custodiante FIDC`,
      ];

    case 'src_bcb_ifdata_authorized_institutions':
      return [
        `${tradeName} Banco Central instituição de pagamento SCD SEP`,
        `${legalName} autorização Banco Central fintech crédito`,
      ];

    case 'src_b3_issuers_material_facts':
      return [
        `${tradeName} B3 fato relevante debênture`,
        `${legalName} debênture mercado de capitais comunicado`,
      ];

    case 'src_open_finance_participants':
      return [
        `${tradeName} Open Finance participante produto financeiro`,
        `${legalName} Open Finance Banco Central API`,
      ];

    case 'src_vc_portfolio_monitor_br':
      return [
        `${tradeName} rodada venture capital Series A Series B`,
        `${companyTerms} Kaszek Monashees Canary Astella Valor Capital`,
      ];

    case 'src_company_jobs_monitor':
      return [
        `${tradeName} vagas tesouraria crédito risco cobrança underwriting`,
        `${tradeName} careers finance capital markets FP&A CFO`,
      ];

    case 'src_receita_federal_cnpj_dataset':
      return [
        `${legalName} CNPJ quadro societário receita federal`,
      ];

    default:
      return [];
  }
};

export const buildInstitutionalRssTargets = (
  sources: RuntimeSourceLike[],
  company: CompanySeed,
  buildRssUrl: BuildRssUrl,
): SourceRssTarget[] => sources.flatMap((source) => buildQueriesFor(source, company).map((query) => ({
  source,
  url: buildRssUrl(query),
})));
