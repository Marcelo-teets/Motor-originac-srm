import { getSupabaseClient } from './supabase.js';
import { sanitizePeopleCapitalText } from './peopleCapitalSignals.js';

export type TechSignalsCandidate = {
  companyName: string;
  sourceUrl: string;
  evidenceSummary: string;
  segment: string;
  subsegment: string;
  companyType: string;
  creditProduct: string;
  targetStructure: string;
  confidence: number;
  dedupeKey: string;
  publishedAt: string | null;
  issueTitle: string;
  rawPayload: Record<string, unknown>;
};

export type TechSignalsDiscoverySummary = {
  scannedEntries: number;
  discovered: number;
  existingCompanies: number;
  existingCandidates: number;
  insertedCandidates: number;
  updatedCandidates: number;
  candidates: TechSignalsCandidate[];
};

const decodeEntities = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const normalizeLoose = (value: string) => normalize(value).replace(/_/g, ' ');

const rssField = (item: string, tag: string) => {
  const escaped = tag.replace(':', '\\:');
  const match = item.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return decodeEntities(match?.[1] ?? '').trim();
};

const isBrazilDescriptor = (value: string) => /\b(?:brazil|brazilian|s[aã]o paulo|rio de janeiro|belo horizonte|campinas|curitiba|bras[ií]lia|porto alegre|florian[oó]polis|recife|fortaleza|salvador|goi[aâ]nia|vit[oó]ria|manaus|joinville|barueri|osasco|santo andr[eé]|s[aã]o jos[eé] dos campos|ribeir[aã]o preto)\b/i.test(value);

const candidateNameFromParagraph = (paragraph: string) => {
  const firstClause = paragraph.split(',')[0]?.trim() ?? '';
  if (firstClause.length < 2 || firstClause.length > 80) return '';
  if (!/^[A-ZÀ-Ý0-9]/.test(firstClause)) return '';
  if (/^(funding rounds?|debt rounds?|team expansion|traction|expanding to latam|m&a|news|companies)$/i.test(firstClause)) return '';
  return firstClause;
};

const classifyCandidate = (paragraph: string) => {
  const text = normalizeLoose(paragraph);
  const isFintech = /fintech|payments?|credit|lender|lending|banking|open finance|financial infrastructure|payroll/.test(text);
  const isCredit = /credit|lender|lending|loan|payroll|fidc|receivables|origination/.test(text);
  const isPayments = /payments?|payment infrastructure|wallet|card/.test(text);
  const hasFidc = /\bfidc\b|direitos creditorios/.test(text);
  const hasDebt = /debt financing|structured debt|credit facility|financing|bndes/.test(text);
  const hasFunding = /raised|funding|series|seed|investment|financing|fidc/.test(text);

  return {
    segment: isFintech ? 'Fintech' : 'Technology',
    subsegment: isCredit ? 'Credit / Lending' : isPayments ? 'Payments' : 'Growth Tech',
    companyType: 'Tech-based / Tech-backed',
    creditProduct: isCredit ? 'Observed credit/lending signal' : 'Unknown',
    targetStructure: hasFidc ? 'FIDC' : hasDebt ? 'DCM / Structured Debt' : hasFunding ? 'Funding / DCM watch' : 'Unknown',
    confidence: hasFidc || (isCredit && hasFunding) ? 0.82 : isFintech || hasFunding ? 0.76 : 0.68,
  };
};

const signalHints = (paragraph: string) => {
  const text = normalizeLoose(paragraph);
  const hints: string[] = [];
  if (/headcount|employees/.test(text)) hints.push('headcount');
  if (/capital markets|funding|treasury/.test(text)) hints.push('capital_markets_or_funding');
  if (/\bfidc\b|direitos creditorios/.test(text)) hints.push('fidc');
  if (/debt financing|structured debt|credit facility/.test(text)) hints.push('structured_debt');
  if (/raised|series|seed|investment/.test(text)) hints.push('equity_funding');
  if (/origination|originations/.test(text)) hints.push('credit_origination');
  if (/revenue|arr|assets under management|aum|customers|clients/.test(text)) hints.push('traction');
  return hints;
};

export const parseTechSignalsCandidates = (xml: string): TechSignalsCandidate[] => {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 12).map((match) => match[1] ?? '');
  const candidates = new Map<string, TechSignalsCandidate>();

  for (const item of items) {
    const issueTitle = sanitizePeopleCapitalText(rssField(item, 'title'));
    const issueLink = sanitizePeopleCapitalText(rssField(item, 'link'));
    const publishedRaw = sanitizePeopleCapitalText(rssField(item, 'pubDate'));
    const publishedTimestamp = Date.parse(publishedRaw);
    const publishedAt = Number.isNaN(publishedTimestamp) ? null : new Date(publishedTimestamp).toISOString();
    const content = rssField(item, 'content:encoded') || rssField(item, 'description');
    const paragraphs = [...content.matchAll(/<(p|li)[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((match) => sanitizePeopleCapitalText(match[2] ?? ''))
      .filter((paragraph) => paragraph.length >= 30);

    for (const paragraph of paragraphs) {
      if (!isBrazilDescriptor(paragraph)) continue;
      const companyName = candidateNameFromParagraph(paragraph);
      if (!companyName) continue;
      const classification = classifyCandidate(paragraph);
      const dedupeKey = `name:${normalize(companyName)}`;
      const existing = candidates.get(dedupeKey);
      const candidate: TechSignalsCandidate = {
        companyName,
        sourceUrl: issueLink,
        evidenceSummary: paragraph.slice(0, 1600),
        ...classification,
        dedupeKey,
        publishedAt,
        issueTitle,
        rawPayload: {
          sourceCode: 'src_tech_signals_latam',
          origin: 'newsletter_discovery',
          issueTitle,
          publishedAt,
          signalHints: signalHints(paragraph),
          evidenceParagraph: paragraph,
        },
      };
      if (!existing || candidate.confidence > existing.confidence || (publishedAt ?? '') > (existing.publishedAt ?? '')) {
        candidates.set(dedupeKey, candidate);
      }
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.confidence - a.confidence || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, 120);
};

export const discoverTechSignalsCandidates = async (feedUrl: string) => {
  const response = await fetch(feedUrl, {
    headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': 'Mozilla/5.0 (compatible; OriginationIntelligence/1.0)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Tech Signals RSS status ${response.status}`);
  const xml = await response.text();
  return {
    candidates: parseTechSignalsCandidates(xml),
    scannedEntries: [...xml.matchAll(/<item>/gi)].length,
  };
};

export const syncTechSignalsDiscoveryCandidates = async (params: {
  feedUrl?: string;
  collectedAt?: string;
} = {}): Promise<TechSignalsDiscoverySummary> => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase service-role client unavailable for Tech Signals candidate discovery.');
  const feedUrl = params.feedUrl ?? 'https://pedrobmesquita.substack.com/feed';
  const collectedAt = params.collectedAt ?? new Date().toISOString();
  const discovery = await discoverTechSignalsCandidates(feedUrl);

  const [companyRows, candidateRows] = await Promise.all([
    client.select('companies', { select: 'id,trade_name,legal_name', limit: 5000 }),
    client.select('discovered_company_candidates', {
      select: 'id,dedupe_key,raw_payload,candidate_status,updated_at',
      filters: [{ column: 'source_ref', value: 'src_tech_signals_latam' }],
      limit: 2000,
    }),
  ]);

  const companyByName = new Map<string, { id: string; tradeName: string }>();
  for (const row of companyRows ?? []) {
    const tradeName = String(row.trade_name ?? '').trim();
    const legalName = String(row.legal_name ?? '').trim();
    if (tradeName) companyByName.set(normalize(tradeName), { id: String(row.id), tradeName });
    if (legalName) companyByName.set(normalize(legalName), { id: String(row.id), tradeName: tradeName || legalName });
  }
  const existingByKey = new Map((candidateRows ?? []).map((row: any) => [String(row.dedupe_key ?? ''), row]));

  let existingCompanies = 0;
  let existingCandidates = 0;
  let insertedCandidates = 0;
  let updatedCandidates = 0;

  for (const candidate of discovery.candidates) {
    const companyMatch = companyByName.get(normalize(candidate.companyName));
    if (companyMatch) {
      existingCompanies += 1;
      continue;
    }

    const existing = existingByKey.get(candidate.dedupeKey) as any;
    if (existing) {
      existingCandidates += 1;
      const previousPayload = existing.raw_payload && typeof existing.raw_payload === 'object' ? existing.raw_payload : {};
      const lineage = Array.isArray(previousPayload.newsletterLineage) ? previousPayload.newsletterLineage : [];
      const lineageEntry = {
        issueTitle: candidate.issueTitle,
        publishedAt: candidate.publishedAt,
        sourceUrl: candidate.sourceUrl,
        evidenceSummary: candidate.evidenceSummary.slice(0, 500),
      };
      const nextLineage = [...lineage, lineageEntry]
        .filter((entry, index, array) => array.findIndex((other) => `${other.issueTitle}|${other.sourceUrl}` === `${entry.issueTitle}|${entry.sourceUrl}`) === index)
        .slice(-12);
      await client.update('discovered_company_candidates', {
        evidence_summary: candidate.evidenceSummary,
        confidence: Math.max(Number(existing.confidence ?? 0), candidate.confidence),
        raw_payload: { ...previousPayload, ...candidate.rawPayload, newsletterLineage: nextLineage },
        captured_at: candidate.publishedAt ?? collectedAt,
        updated_at: collectedAt,
      }, [{ column: 'id', value: existing.id }]);
      updatedCandidates += 1;
      continue;
    }

    await client.insert('discovered_company_candidates', [{
      company_name: candidate.companyName,
      legal_name: null,
      website: null,
      normalized_domain: null,
      cnpj: null,
      geography: 'Brasil',
      segment: candidate.segment,
      subsegment: candidate.subsegment,
      company_type: candidate.companyType,
      credit_product: candidate.creditProduct,
      target_structure: candidate.targetStructure,
      source_ref: 'src_tech_signals_latam',
      source_url: candidate.sourceUrl,
      evidence_summary: candidate.evidenceSummary,
      receivables: candidate.targetStructure === 'FIDC' ? ['FIDC/funding estruturado observado — validar lastro e veículo'] : [],
      confidence: candidate.confidence,
      candidate_status: 'captured',
      company_id: null,
      dedupe_key: candidate.dedupeKey,
      raw_payload: {
        ...candidate.rawPayload,
        newsletterLineage: [{
          issueTitle: candidate.issueTitle,
          publishedAt: candidate.publishedAt,
          sourceUrl: candidate.sourceUrl,
          evidenceSummary: candidate.evidenceSummary.slice(0, 500),
        }],
      },
      captured_at: candidate.publishedAt ?? collectedAt,
      created_at: collectedAt,
      updated_at: collectedAt,
    }]);
    insertedCandidates += 1;
  }

  return {
    scannedEntries: discovery.scannedEntries,
    discovered: discovery.candidates.length,
    existingCompanies,
    existingCandidates,
    insertedCandidates,
    updatedCandidates,
    candidates: discovery.candidates,
  };
};
