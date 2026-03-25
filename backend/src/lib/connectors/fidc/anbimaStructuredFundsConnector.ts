export type AnbimaStructuredFundListItem = {
  cnpj_fundo: string;
  razao_social?: string;
  classe_anbima?: string;
  classes_serie_cota?: Array<{
    codigo_anbima?: string;
    nome_fantasia?: string;
    nome_fantasia_2?: string;
    tipo_classe_cota?: string;
    situacao_atual?: string;
    data_inicio?: string;
    data_primeiro_aporte?: string;
    data_inicio_divulgacao_cota?: string;
    data_encerramento?: string;
    restrito?: boolean;
    investidor_qualificado?: boolean;
    isin?: string;
    fundo_adaptado_icvm_175?: boolean;
    data_fundo_adaptado_icvm_175?: string;
    responsabilidade_ltda?: boolean;
  }>;
};

export type AnbimaStructuredFundsPage = {
  items: AnbimaStructuredFundListItem[];
  total?: number;
  totalPages?: number;
  page: number;
};

type RawAnbimaListPayload = {
  data?: AnbimaStructuredFundListItem[];
  total?: number;
  total_paginas?: number;
  totalPages?: number;
};

function buildHeaders(token: string) {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  };
}

export class AnbimaStructuredFundsConnector {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://api.anbima.com.br/feed/fundos/v1/fundos-estruturados',
  ) {}

  async list(page = 1, size = 300): Promise<AnbimaStructuredFundsPage> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('page', String(page));
    url.searchParams.set('size', String(size));

    const response = await fetch(url.toString(), { headers: buildHeaders(this.token) });
    if (!response.ok) {
      throw new Error(`ANBIMA list request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as RawAnbimaListPayload;

    return {
      items: payload.data ?? [],
      total: payload.total,
      totalPages: payload.totalPages ?? payload.total_paginas,
      page,
    };
  }

  async detail(cnpjFundo: string) {
    const response = await fetch(`${this.baseUrl}/${cnpjFundo}`, { headers: buildHeaders(this.token) });
    if (!response.ok) {
      throw new Error(`ANBIMA detail request failed with status ${response.status}`);
    }
    return response.json();
  }
}
