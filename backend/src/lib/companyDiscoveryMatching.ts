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
  matchMethod: 'cnpj' | 'website' | 'name_similarity';
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const normalizeDomain = (value?: string) => {
  if (!value) return '';
  return value
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim()
    .toLowerCase();
};

const similarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.86;
  const unique = [...new Set(na.split(''))];
  const overlap = unique.filter((char) => nb.includes(char)).length;
  return overlap / Math.max(na.length, nb.length, 1);
};

export const findBestCompanyMatch = (
  candidate: CandidateMatchInput,
  existingCompanies: ExistingCompanyMatchCandidate[],
): CandidateCompanyMatch | null => {
  if (candidate.cnpj) {
    const cnpjMatch = existingCompanies.find((item) => item.cnpj && item.cnpj === candidate.cnpj);
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
        confidence: 0.95,
        matchMethod: 'website',
      };
    }
  }

  const ranked = existingCompanies
    .map((item) => ({ companyId: item.id, score: similarity(item.name, candidate.companyName) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (best && best.score >= 0.67) {
    return {
      companyId: best.companyId,
      confidence: Number(best.score.toFixed(4)),
      matchMethod: 'name_similarity',
    };
  }

  return null;
};
