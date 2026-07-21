export type OpenFinanceParticipant = {
  organisationId: string;
  name: string;
  registeredName: string;
  cnpj: string;
  status: string;
};

export const OPEN_FINANCE_DIRECTORY_URL = 'https://data.directory.openbankingbrasil.org.br/participants';

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

const onlyDigits = (value: string) => value.replace(/\D/g, '');

// O diretório oficial retorna um array de organizações; o parse é defensivo e
// mantém só os campos usados no matching e na evidência.
export async function fetchOpenFinanceParticipants(): Promise<OpenFinanceParticipant[]> {
  const response = await fetch(OPEN_FINANCE_DIRECTORY_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Open Finance directory request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error('Open Finance directory returned an invalid payload');
  }

  return payload
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = asString(record.OrganisationName);
      if (!name) return null;
      return {
        organisationId: asString(record.OrganisationId),
        name,
        registeredName: asString(record.RegisteredName) || name,
        cnpj: onlyDigits(asString(record.RegistrationNumber)),
        status: asString(record.Status) || 'Unknown',
      } satisfies OpenFinanceParticipant;
    })
    .filter((item): item is OpenFinanceParticipant => Boolean(item));
}
