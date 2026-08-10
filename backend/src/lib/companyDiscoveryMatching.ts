export type ExistingCompanyMatchCandidate = {
  id: string;
  name: string;
  cnpj?: string;
  website?: string;
};

export type CandidateMatchInput = {
  companyName: string;
  cnpj?: string;
  website?: string;
};

export type CandidateCompanyMatch = {
  companyId: string;
  confidence: number;
  matchMethod: 'cnpj' | 'website' | 'exact_name';
};

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const normalizeCnpj = (value?: string) => String(value ?? '').replace(/\D/g, '');

const normalizeDomain = (value?: string) => {
  if (!value) return '';
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim()
    .toLowerCase();
};

export const findBestCompanyMatch = (
  candidate: CandidateMatchInput,
  existingCompanies: ExistingCompanyMatchCandidate[],
): CandidateCompanyMatch | null => {
  const candidateCnpj = normalizeCnpj(candidate.cnpj);
  if (candidateCnpj.length === 14) {
    const cnpjMatch = existingCompanies.find((item) => normalizeCnpj(item.cnpj) === candidateCnpj);
    if (cnpjMatch) {
      return {
        companyId: cnpjMatch.id,
        confidence: 1,
        matchMethod: 'cnpj',
      };
    }
  }

  const candidateDomain = normalizeDomain(candidate.website);
  if (candidateDomain) {
    const websiteMatch = existingCompanies.find((item) => normalizeDomain(item.website) === candidateDomain);
    if (websiteMatch) {
      return {
        companyId: websiteMatch.id,
        confidence: 0.99,
        matchMethod: 'website',
      };
    }
  }

  // Nome sem CNPJ/domínio só pode auto-vincular quando a identidade textual é
  // exata após normalização. Similaridade fuzzy continua útil para revisão
  // humana, mas não é prova suficiente para alterar Company Master ou dedupe.
  const candidateName = normalizeName(candidate.companyName);
  if (!candidateName) return null;

  const exactNameMatch = existingCompanies.find((item) => normalizeName(item.name) === candidateName);
  if (exactNameMatch) {
    return {
      companyId: exactNameMatch.id,
      confidence: 0.94,
      matchMethod: 'exact_name',
    };
  }

  return null;
};
