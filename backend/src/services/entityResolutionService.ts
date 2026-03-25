import { getSupabaseClient } from '../lib/supabase.js';

type CompanyCandidate = {
  id: string;
  name: string;
  cnpj?: string;
  website?: string;
};

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

export class EntityResolutionService {
  private readonly client = getSupabaseClient();

  private similarity(a: string, b: string) {
    if (!a || !b) return 0;
    const na = normalize(a);
    const nb = normalize(b);
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.85;
    const common = [...new Set(na.split(''))].filter((char) => nb.includes(char)).length;
    return common / Math.max(na.length, nb.length, 1);
  }

  async listCompanies(): Promise<CompanyCandidate[]> {
    if (!this.client) return [];
    const rows = await this.client.select('companies', { select: 'id,name,cnpj,website' }).catch(() => []);
    return Array.isArray(rows) ? rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      cnpj: row.cnpj ?? undefined,
      website: row.website ?? undefined,
    })) : [];
  }

  async findBestCompanyMatch(input: { name?: string; cnpj?: string; website?: string }) {
    const companies = await this.listCompanies();
    if (!companies.length) return null;

    if (input.cnpj) {
      const cnpjMatch = companies.find((company) => company.cnpj === input.cnpj);
      if (cnpjMatch) return { company: cnpjMatch, confidence: 1, matchMethod: 'cnpj' };
    }

    if (input.website) {
      const websiteMatch = companies.find((company) => company.website && normalize(company.website) === normalize(input.website));
      if (websiteMatch) return { company: websiteMatch, confidence: 0.95, matchMethod: 'website' };
    }

    if (input.name) {
      const ranked = companies
        .map((company) => ({ company, score: this.similarity(company.name, input.name!) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      if (best && best.score >= 0.65) {
        return { company: best.company, confidence: Number(best.score.toFixed(4)), matchMethod: 'name_similarity' };
      }
    }

    return null;
  }

  async ensureAlias(companyId: string, alias: string, aliasType = 'brand') {
    if (!this.client) return { company_id: companyId, alias, alias_type: aliasType };
    const [saved] = await this.client.upsert('company_aliases', [{
      company_id: companyId,
      alias,
      alias_type: aliasType,
    }], 'company_id,alias');
    return saved;
  }
}
