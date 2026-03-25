export type InfosimplesParticipantQuery = {
  cnpj?: string;
  cpf?: string;
  name?: string;
};

export class InfosimplesParticipantConnector {
  constructor(
    private readonly token: string,
    private readonly baseUrl = 'https://infosimples.com/api/v2/consultas/cvm-participante',
  ) {}

  async search(query: InfosimplesParticipantQuery) {
    const url = new URL(this.baseUrl);
    if (query.cnpj) url.searchParams.set('cnpj', query.cnpj);
    if (query.cpf) url.searchParams.set('cpf', query.cpf);
    if (query.name) url.searchParams.set('name', query.name);

    const response = await fetch(url.toString(), {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Infosimples participante request failed with status ${response.status}`);
    }

    return response.json();
  }
}
