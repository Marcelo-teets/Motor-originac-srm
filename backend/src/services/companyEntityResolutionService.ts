import { getSupabaseClient } from '../lib/supabase.js';

export type CompanyAliasType = 'cnpj' | 'legal_name' | 'trade_name' | 'normalized_name' | 'domain' | 'website_host';

export type CompanyAliasCandidate = {
  company_id: string;
  alias_type: CompanyAliasType;
  alias_value: string;
  source_id: string | null;
  confidence_score: number;
};

type CompanyRow = {
  id: string;
  legal_name?: string | null;
  trade_name?: string | null;
  normalized_name?: string | null;
  cnpj?: string | null;
  domain?: string | null;
  website_url?: string | null;
  website?: string | null;
  metadata?: Record<string, unknown> | null;
};

type AliasRow = {
  company_id: string;
  alias_type: string;
  alias_value: string;
};

export type EntityResolutionInput = {
  cnpj?: string | null;
  name?: string | null;
  domain?: string | null;
};

export type EntityResolutionMatch = {
  companyId: string;
  confidence: number;
  reason: 'canonical_cnpj' | 'alias_match' | 'no_match';
  aliasType?: string;
  aliasValue?: string;
};

export type EntityAliasBackfillSummary = {
  mode: 'rpc' | 'rest' | 'memory';
  companiesChecked: number;
  aliasesPlanned: number;
  aliasesWritten: number;
  skippedExisting: number;
  errors: string[];
};

export const normalizeCnpj = (value?: string | null) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
};

const normalizeAlias = (value?: string | null) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const cleanValue = (value?: string | null) => {
  const trimmed = String(value ?? '').trim();
  return trimmed.length ? trimmed : null;
};

const hostFromUrl = (value?: string | null) => {
  const raw = cleanValue(value);
  if (!raw) return null;
  try {
    const url = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};

const aliasKey = (alias: Pick<CompanyAliasCandidate, 'company_id' | 'alias_type' | 'alias_value'>) => (
  `${alias.company_id}|${alias.alias_type}|${alias.alias_value}`
);

const pushAlias = (
  aliases: CompanyAliasCandidate[],
  companyId: string,
  aliasType: CompanyAliasType,
  rawValue: string | null,
  confidence: number,
) => {
  if (!rawValue) return;
  const aliasValue = aliasType === 'cnpj' ? normalizeCnpj(rawValue) : cleanValue(rawValue);
  if (!aliasValue) return;
  aliases.push({
    company_id: companyId,
    alias_type: aliasType,
    alias_value: aliasType === 'domain' || aliasType === 'website_host' ? aliasValue.toLowerCase() : aliasValue,
    source_id: null,
    confidence_score: confidence,
  });
};

export const buildCompanyAliasCandidates = (company: CompanyRow): CompanyAliasCandidate[] => {
  const aliases: CompanyAliasCandidate[] = [];
  pushAlias(aliases, company.id, 'cnpj', company.cnpj ?? null, 1);
  pushAlias(aliases, company.id, 'legal_name', company.legal_name ?? null, 0.95);
  pushAlias(aliases, company.id, 'trade_name', company.trade_name ?? null, 0.9);
  pushAlias(aliases, company.id, 'normalized_name', company.normalized_name ?? normalizeAlias(company.trade_name ?? company.legal_name), 0.86);
  pushAlias(aliases, company.id, 'domain', company.domain ?? null, 0.82);
  pushAlias(aliases, company.id, 'website_host', hostFromUrl(company.website_url ?? company.website ?? company.domain), 0.8);

  const seen = new Set<string>();
  return aliases.filter((alias) => {
    const key = aliasKey(alias);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export class CompanyEntityResolutionService {
  private readonly client = getSupabaseClient();

  private async listCompanies(): Promise<CompanyRow[]> {
    if (!this.client) return [];
    return this.client.select('companies', { select: 'id,legal_name,trade_name,normalized_name,cnpj,domain,website_url,website,metadata' }) as Promise<CompanyRow[]>;
  }

  private async listAliases(): Promise<AliasRow[]> {
    if (!this.client) return [];
    return this.client.select('company_entity_aliases', { select: 'company_id,alias_type,alias_value' }) as Promise<AliasRow[]>;
  }

  async backfillCanonicalAliases(): Promise<EntityAliasBackfillSummary> {
    if (!this.client) {
      return { mode: 'memory', companiesChecked: 0, aliasesPlanned: 0, aliasesWritten: 0, skippedExisting: 0, errors: ['Supabase client not configured.'] };
    }

    try {
      const rpcSummary = await this.client.rpc<EntityAliasBackfillSummary>('backfill_company_entity_aliases_from_cnpj', {});
      return { ...rpcSummary, mode: 'rpc', errors: rpcSummary.errors ?? [] };
    } catch {
      // The mirror migration may not have been applied yet. Fall back to REST-safe idempotence.
    }

    const errors: string[] = [];
    try {
      const [companies, existing] = await Promise.all([this.listCompanies(), this.listAliases()]);
      const existingKeys = new Set((existing ?? []).map((row) => aliasKey(row as CompanyAliasCandidate)));
      const candidates = companies.flatMap(buildCompanyAliasCandidates);
      const toWrite = candidates.filter((alias) => !existingKeys.has(aliasKey(alias)));

      if (toWrite.length) {
        await this.client.upsert('company_entity_aliases', toWrite, 'company_id,alias_type,alias_value');
      }

      return {
        mode: 'rest',
        companiesChecked: companies.length,
        aliasesPlanned: candidates.length,
        aliasesWritten: toWrite.length,
        skippedExisting: candidates.length - toWrite.length,
        errors,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return { mode: 'rest', companiesChecked: 0, aliasesPlanned: 0, aliasesWritten: 0, skippedExisting: 0, errors };
    }
  }

  async resolveEntity(input: EntityResolutionInput): Promise<EntityResolutionMatch> {
    const companies = await this.listCompanies();
    const canonicalCnpj = normalizeCnpj(input.cnpj);

    if (canonicalCnpj) {
      const company = companies.find((item) => normalizeCnpj(item.cnpj) === canonicalCnpj);
      if (company) return { companyId: company.id, confidence: 1, reason: 'canonical_cnpj', aliasType: 'cnpj', aliasValue: canonicalCnpj };
    }

    const aliases = await this.listAliases();
    const inputAliases = [input.name, input.domain, hostFromUrl(input.domain)]
      .map((value) => normalizeAlias(value))
      .filter(Boolean);

    for (const alias of aliases) {
      const normalizedAlias = normalizeAlias(alias.alias_value);
      if (inputAliases.includes(normalizedAlias)) {
        return {
          companyId: alias.company_id,
          confidence: alias.alias_type === 'cnpj' ? 1 : 0.82,
          reason: 'alias_match',
          aliasType: alias.alias_type,
          aliasValue: alias.alias_value,
        };
      }
    }

    return { companyId: '', confidence: 0, reason: 'no_match' };
  }
}
