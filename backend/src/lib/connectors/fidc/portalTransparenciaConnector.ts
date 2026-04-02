export type PortalTransparenciaFavorecidoQuery = {
  cnpj: string;
  pagina?: number;
  tamanhoPagina?: number;
};

export class PortalTransparenciaConnector {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://portaldatransparencia.gov.br/api-de-dados',
  ) {}

  private buildHeaders() {
    return {
      accept: 'application/json',
      'chave-api-dados': this.token,
    };
  }

  async fetchContratosByFavorecido(query: PortalTransparenciaFavorecidoQuery) {
    const url = new URL(`${this.baseUrl}/contratos`);
    url.searchParams.set('cpfCnpjFornecedor', query.cnpj);
    url.searchParams.set('pagina', String(query.pagina ?? 1));
    url.searchParams.set('tamanhoPagina', String(query.tamanhoPagina ?? 50));

    const response = await fetch(url.toString(), { headers: this.buildHeaders() });
    if (!response.ok) {
      throw new Error(`Portal da Transparencia contratos request failed with status ${response.status}`);
    }

    return response.json();
  }

  async fetchPagamentosByFavorecido(query: PortalTransparenciaFavorecidoQuery) {
    const url = new URL(`${this.baseUrl}/pagamentos`);
    url.searchParams.set('cpfCnpjFavorecido', query.cnpj);
    url.searchParams.set('pagina', String(query.pagina ?? 1));
    url.searchParams.set('tamanhoPagina', String(query.tamanhoPagina ?? 50));

    const response = await fetch(url.toString(), { headers: this.buildHeaders() });
    if (!response.ok) {
      throw new Error(`Portal da Transparencia pagamentos request failed with status ${response.status}`);
    }

    return response.json();
  }
}
