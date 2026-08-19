export type PeopleCapitalSignal = {
  type: string;
  strength: number;
  confidenceScore: number;
  evidenceText: string;
  sourceUrl: string;
};

export type JobOpeningObservation = {
  externalJobId: string;
  title: string;
  normalizedTitle: string;
  roleFamily: string;
  seniority: string;
  location: string | null;
  employmentType: string | null;
  sourceUrl: string;
  openedAt: string | null;
  dcmRelevanceScore: number;
  creditRelevanceScore: number;
  confidenceScore: number;
  rawPayload: Record<string, unknown>;
};

export type HeadcountObservation = {
  total: number;
  growthPct: number | null;
  inferredPreviousTotal: number | null;
  periodLabel: 'month' | 'quarter' | 'unknown';
  observedAt: string;
  sourceUrl: string;
  confidenceScore: number;
  evidenceText: string;
};

export type InvestorRelationshipObservation = {
  investorName: string;
  relationshipType: 'equity_investor' | 'lead_investor' | 'participant_investor';
  roundStage: string | null;
  roundAmount: number | null;
  roundCurrency: string | null;
  isLead: boolean;
  announcedAt: string | null;
  sourceUrl: string;
  confidenceScore: number;
  evidenceText: string;
};

export type PeopleCapitalCapture = {
  connectorStatus: 'real' | 'partial';
  matched: boolean;
  sourceUrl: string;
  collectedAt: string;
  jobs: JobOpeningObservation[];
  headcount: HeadcountObservation | null;
  investors: InvestorRelationshipObservation[];
  signals: PeopleCapitalSignal[];
  metadata: Record<string, unknown>;
};

const decodeEntities = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

export const sanitizePeopleCapitalText = (value: string) => decodeEntities(value)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const parseNumber = (raw: string) => {
  const value = raw.trim().replace(/\s+/g, '');
  if (!value) return Number.NaN;
  if (/^-?\d{1,3}(?:[.,]\d{3})+$/.test(value)) return Number(value.replace(/[.,]/g, ''));
  if (/^-?\d+[.,]\d+$/.test(value)) return Number(value.replace(',', '.'));
  return Number(value.replace(/[^\d.-]/g, ''));
};

const normalizeDate = (value: string) => {
  const timestamp = Date.parse(value);
  return value && !Number.isNaN(timestamp) ? new Date(timestamp).toISOString() : null;
};

export const stableTextKey = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const classifyRoleFamily = (title: string) => {
  const value = normalize(title);
  if (/capital markets|mercado de capitais|securitiza|structured finance|dcm/.test(value)) return 'capital_markets';
  if (/funding|fundraising|debt capital|capital structure/.test(value)) return 'funding';
  if (/treasury|tesouraria|liquidez/.test(value)) return 'treasury';
  if (/underwriting|underwriter|credit policy|politica de credito/.test(value)) return 'underwriting';
  if (/credit risk|risco de credito|risk credit/.test(value)) return 'risk';
  if (/credito|credit|lending|loan/.test(value)) return 'credit';
  if (/collections|cobranca|recovery|recuperacao/.test(value)) return 'collections';
  if (/finance|financial|financas|fp&a|controllership|controladoria/.test(value)) return 'finance';
  return 'other';
};

export const inferSeniority = (title: string) => {
  const value = normalize(title);
  if (/chief|cfo|cro|cto|ceo|c level/.test(value)) return 'c_level';
  if (/vp|vice president|head|director|diretor/.test(value)) return 'executive';
  if (/manager|gerente|lead|coordenador|coordinator/.test(value)) return 'manager';
  if (/senior|\bsr\b|especialista|principal/.test(value)) return 'senior';
  if (/junior|\bjr\b|estagio|intern/.test(value)) return 'junior';
  return 'unspecified';
};

const roleScores = (family: string) => {
  const dcm: Record<string, number> = { capital_markets: 100, funding: 96, treasury: 90, underwriting: 84, credit: 82, risk: 78, collections: 62, finance: 48, other: 8 };
  const credit: Record<string, number> = { credit: 100, underwriting: 98, risk: 94, funding: 90, capital_markets: 88, collections: 84, treasury: 78, finance: 52, other: 8 };
  return { dcm: dcm[family] ?? 8, credit: credit[family] ?? 8 };
};

const absoluteUrl = (href: string, baseUrl: string) => {
  try { return new URL(href, baseUrl).toString(); } catch { return href; }
};

const asString = (value: unknown) => typeof value === 'string' ? sanitizePeopleCapitalText(value) : '';

const collectJobPostingObjects = (value: unknown, output: Record<string, unknown>[]) => {
  if (Array.isArray(value)) return value.forEach((item) => collectJobPostingObjects(item, output));
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const type = record['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) output.push(record);
  collectJobPostingObjects(record['@graph'], output);
};

const jobFromJsonLd = (job: Record<string, unknown>, baseUrl: string): JobOpeningObservation | null => {
  const title = asString(job.title ?? job.name);
  if (!title) return null;
  const family = classifyRoleFamily(title);
  const scores = roleScores(family);
  const locationObject = job.jobLocation && typeof job.jobLocation === 'object' ? job.jobLocation as Record<string, unknown> : null;
  const address = locationObject?.address && typeof locationObject.address === 'object' ? locationObject.address as Record<string, unknown> : null;
  const location = [address?.addressLocality, address?.addressRegion, address?.addressCountry].map(asString).filter(Boolean).join(', ') || null;
  const sourceUrl = absoluteUrl(asString(job.url) || baseUrl, baseUrl);
  const identifier = job.identifier && typeof job.identifier === 'object'
    ? asString((job.identifier as Record<string, unknown>).value)
    : asString(job.identifier);
  return {
    externalJobId: identifier || stableTextKey(`${title}|${location ?? ''}|${sourceUrl}`),
    title,
    normalizedTitle: normalize(title),
    roleFamily: family,
    seniority: inferSeniority(title),
    location,
    employmentType: asString(job.employmentType) || null,
    sourceUrl,
    openedAt: normalizeDate(asString(job.datePosted)),
    dcmRelevanceScore: scores.dcm,
    creditRelevanceScore: scores.credit,
    confidenceScore: 0.9,
    rawPayload: job,
  };
};

export const extractJobOpenings = (html: string, baseUrl: string) => {
  const jobs: JobOpeningObservation[] = [];
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeEntities(block[1] ?? '')) as unknown;
      const postings: Record<string, unknown>[] = [];
      collectJobPostingObjects(parsed, postings);
      postings.forEach((posting) => { const job = jobFromJsonLd(posting, baseUrl); if (job) jobs.push(job); });
    } catch { /* malformed JSON-LD falls through to anchor discovery */ }
  }

  const jobHref = /jobs?|careers?|carreiras?|vagas?|positions?|openings?|greenhouse|lever|ashby|gupy|workday/i;
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{1,400}?)<\/a>/gi)) {
    const href = match[1] ?? '';
    const title = sanitizePeopleCapitalText(match[2] ?? '');
    if (!jobHref.test(href) || title.length < 4 || title.length > 180 || /^(careers?|carreiras?|jobs?|vagas?|ver vagas|see jobs|open positions)$/i.test(title)) continue;
    const sourceUrl = absoluteUrl(href, baseUrl);
    const family = classifyRoleFamily(title);
    const scores = roleScores(family);
    jobs.push({
      externalJobId: stableTextKey(`${title}|${sourceUrl}`), title, normalizedTitle: normalize(title), roleFamily: family,
      seniority: inferSeniority(title), location: null, employmentType: null, sourceUrl, openedAt: null,
      dcmRelevanceScore: scores.dcm, creditRelevanceScore: scores.credit, confidenceScore: 0.68,
      rawPayload: { captureMode: 'anchor_fallback' },
    });
  }

  const deduped = new Map<string, JobOpeningObservation>();
  jobs.forEach((job) => {
    const key = `${job.externalJobId}|${job.normalizedTitle}`;
    const current = deduped.get(key);
    if (!current || job.confidenceScore > current.confidenceScore) deduped.set(key, job);
  });
  return [...deduped.values()].slice(0, 150);
};

const signalsFromJobs = (jobs: JobOpeningObservation[], sourceUrl: string): PeopleCapitalSignal[] => {
  const counts = jobs.reduce<Record<string, number>>((acc, job) => { acc[job.roleFamily] = (acc[job.roleFamily] ?? 0) + 1; return acc; }, {});
  const strategic = jobs.filter((job) => job.dcmRelevanceScore >= 60).length;
  const creditBuildout = (counts.credit ?? 0) + (counts.risk ?? 0) + (counts.underwriting ?? 0) + (counts.collections ?? 0);
  return [
    (counts.capital_markets ?? 0) > 0 ? { type: 'capital_markets_hiring', strength: 92, confidenceScore: 0.88, evidenceText: `${counts.capital_markets} vaga(s) aberta(s) diretamente em Capital Markets/DCM.`, sourceUrl } : null,
    (counts.funding ?? 0) + (counts.treasury ?? 0) > 0 ? { type: 'funding_team_hiring', strength: 90, confidenceScore: 0.86, evidenceText: `${(counts.funding ?? 0) + (counts.treasury ?? 0)} vaga(s) aberta(s) em Funding/Tesouraria.`, sourceUrl } : null,
    creditBuildout > 0 ? { type: 'credit_team_hiring', strength: Math.min(94, 78 + creditBuildout * 3), confidenceScore: 0.86, evidenceText: `${creditBuildout} vaga(s) aberta(s) em Crédito/Risco/Underwriting/Cobrança.`, sourceUrl } : null,
    strategic >= 3 ? { type: 'credit_infrastructure_buildout', strength: Math.min(95, 82 + strategic * 2), confidenceScore: 0.84, evidenceText: `${strategic} vagas estratégicas ligadas a crédito/funding/DCM indicam construção de infraestrutura financeira.`, sourceUrl } : null,
  ].filter((signal): signal is PeopleCapitalSignal => Boolean(signal));
};

const validatedCareersPage = (html: string, jobs: JobOpeningObservation[]) => {
  if (jobs.length) return true;
  const titleAndHeadings = sanitizePeopleCapitalText([
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '',
    ...[...html.matchAll(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi)].slice(0, 4).map((match) => match[1] ?? ''),
  ].join(' '));
  const pageText = sanitizePeopleCapitalText(html).slice(0, 12_000);
  return /careers?|carreiras?|trabalhe conosco|work with us|join (?:our )?team|vagas abertas|open positions/i.test(titleAndHeadings)
    || /no open positions|no current openings|nenhuma vaga aberta|nao temos vagas|não temos vagas/i.test(pageText);
};

export const captureCompanyCareers = async (params: { companyName: string; website: string; collectedAt?: string }): Promise<PeopleCapitalCapture> => {
  const collectedAt = params.collectedAt ?? new Date().toISOString();
  const base = params.website.startsWith('http') ? params.website : `https://${params.website}`;
  const paths = ['/careers', '/carreiras', '/jobs', '/vagas', '/work-with-us', '/trabalhe-conosco'];
  const pages: Array<{ url: string; jobs: JobOpeningObservation[] }> = [];

  await Promise.all(paths.map(async (path) => {
    const url = new URL(path, base).toString();
    try {
      const response = await fetch(url, { headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; OriginationIntelligence/1.0)' }, signal: AbortSignal.timeout(12_000) });
      if (!response.ok) return;
      const html = await response.text();
      const jobs = extractJobOpenings(html, response.url || url);
      if (validatedCareersPage(html, jobs)) pages.push({ url: response.url || url, jobs });
    } catch { /* path failures are non-fatal */ }
  }));

  const deduped = new Map<string, JobOpeningObservation>();
  pages.flatMap((page) => page.jobs).forEach((job) => deduped.set(`${job.externalJobId}|${job.normalizedTitle}`, job));
  const jobs = [...deduped.values()];
  const sourceUrl = pages[0]?.url ?? base;
  return {
    connectorStatus: pages.length ? 'real' : 'partial', matched: pages.length > 0, sourceUrl, collectedAt,
    jobs, headcount: null, investors: [], signals: signalsFromJobs(jobs, sourceUrl),
    metadata: {
      companyName: params.companyName, successfulCareerPages: pages.length, attemptedPaths: paths,
      pages: pages.map((page) => ({ url: page.url, jobs: page.jobs.length })), openJobs: jobs.length,
      strategicOpenJobs: jobs.filter((job) => job.dcmRelevanceScore >= 60).length,
      roleFamilies: jobs.reduce<Record<string, number>>((acc, job) => { acc[job.roleFamily] = (acc[job.roleFamily] ?? 0) + 1; return acc; }, {}),
    },
  };
};

const rssField = (item: string, tag: string) => {
  const escaped = tag.replace(':', '\\:');
  return decodeEntities(item.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'))?.[1] ?? '').trim();
};

const companyContext = (html: string, aliases: string[]) => {
  const normalizedAliases = aliases.map(normalize).filter((alias) => alias.length >= 3);
  const blocks = [...html.matchAll(/<(p|li|article)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => sanitizePeopleCapitalText(match[2] ?? ''))
    .filter((block) => block.length >= 20)
    .filter((block) => normalizedAliases.some((alias) => normalize(block).includes(alias)));
  if (blocks.length) {
    const signalTerms = /headcount|employees|raised|funding|series|seed|fidcs?|financing|revenue|originations?|customers?|arr|assets under management/i;
    return blocks.sort((a, b) => ((signalTerms.test(b) ? 10_000 : 0) + b.length) - ((signalTerms.test(a) ? 10_000 : 0) + a.length))[0] ?? null;
  }
  const text = sanitizePeopleCapitalText(html);
  return normalizedAliases.some((alias) => normalize(text).includes(alias)) ? text.slice(0, 1800) : null;
};

const parseHeadcount = (context: string, sourceUrl: string, observedAt: string): HeadcountObservation | null => {
  const text = sanitizePeopleCapitalText(context);
  const patterns = [
    /~?(\d+(?:[.,]\d+)?)%\s+(?:headcount\s+)?(?:growth|increase|expansion)[^.!?]{0,220}?(?:reaching|reached|to|at|total(?:\s+of)?)\s+(?:a\s+)?(?:total\s+of\s+)?([\d.,]+)\s+(?:employees|people|team members)/i,
    /(?:headcount|team)[^.!?]{0,120}?~?(\d+(?:[.,]\d+)?)%[^.!?]{0,220}?([\d.,]+)\s+(?:employees|people|team members)/i,
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  if (!match) return null;
  const growthPct = Number(String(match[1]).replace(',', '.'));
  const total = parseNumber(String(match[2]));
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(growthPct) || growthPct < -100 || growthPct > 1000) return null;
  const normalized = normalize(text);
  const periodLabel: HeadcountObservation['periodLabel'] = /quarter|trimestre|three months|3 months/.test(normalized) ? 'quarter' : /month|mes|30 days/.test(normalized) ? 'month' : 'unknown';
  return {
    total: Math.round(total), growthPct, inferredPreviousTotal: growthPct > -100 ? Math.max(0, Math.round(total / (1 + growthPct / 100))) : null,
    periodLabel, observedAt, sourceUrl, confidenceScore: 0.82, evidenceText: match[0].trim(),
  };
};

const parseAmount = (text: string) => {
  const match = text.match(/(US\$|USD|R\$|\$)\s*([\d.,]+)\s*(billion|million|thousand|bilh(?:ao|oes)|milh(?:ao|oes)|B|M|K|mil)?/i);
  if (!match) return { amount: null, currency: null };
  const base = parseNumber(match[2] ?? '');
  const unit = match[3] ?? '';
  const multiplier = /b|billion|bilh/i.test(unit) ? 1_000_000_000 : /m|million|milh/i.test(unit) ? 1_000_000 : /k|thousand|mil/i.test(unit) ? 1_000 : 1;
  return { amount: Number.isFinite(base) ? base * multiplier : null, currency: /r\$/i.test(match[1] ?? '') ? 'BRL' : 'USD' };
};

const cleanInvestorNames = (value: string) => value
  .replace(/\s+(?:and|e)\s+/gi, ',')
  .replace(/\s+alongside\s+/gi, ',')
  .split(',')
  .map((name) => name.replace(/^(?:the|a|an|angel investors?\s+|existing investors?\s+|new investors?\s+)/i, '').trim())
  .map((name) => name.replace(/\s+(?:also\s+)?participated.*$/i, '').trim())
  .filter((name) => name.length >= 2 && name.length <= 90)
  .filter((name) => !/^(?:other |additional )?(?:financial-sector )?investors?$|undisclosed|investment round|funding round/i.test(name.toLowerCase()));

const parseFundingInvestors = (context: string, sourceUrl: string, announcedAt: string | null): InvestorRelationshipObservation[] => {
  const text = sanitizePeopleCapitalText(context);
  if (!/raised|funding round|series\s+[a-z]|seed round|captou|rodada|secured .*financing|fidcs?/i.test(text)) return [];
  const stage = text.match(/\b(series\s+[a-z0-9]+|pre-seed|seed|growth)\b/i)?.[1] ?? null;
  const amount = parseAmount(text);
  const observations: InvestorRelationshipObservation[] = [];
  const leadMatches = [
    text.match(/led by\s+([^.;]+?)(?=\s+with participation|\s+alongside|\s+and participation|[.;]|$)/i),
    text.match(/(?:^|[.;]\s*)([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9&' -]{1,80})\s+led the investment/i),
    text.match(/(?:with\s+)?([A-ZÀ-Ý][A-Za-zÀ-ÿ0-9&' -]{1,80})\s+(?:serving|acting) as (?:the )?(?:principal|lead) investor/i),
  ].filter((match): match is RegExpMatchArray => Boolean(match));
  const participantMatches = [
    text.match(/(?:with participation from|participation from|alongside)\s+([^.;]+)/i),
    text.match(/([^.]{2,900}?)\s+(?:also\s+)?participated(?:\s+in\s+[^.;]+)?[.;]/i),
    text.match(/backed by\s+([^.;]+)/i),
    text.match(/angel investors? (?:included|include)\s+([^.;]+)/i),
  ].filter((match): match is RegExpMatchArray => Boolean(match));

  const push = (investorName: string, isLead: boolean, evidenceText: string) => observations.push({
    investorName, relationshipType: isLead ? 'lead_investor' : 'participant_investor', roundStage: stage,
    roundAmount: amount.amount, roundCurrency: amount.currency, isLead, announcedAt, sourceUrl,
    confidenceScore: isLead ? 0.82 : 0.78, evidenceText,
  });
  leadMatches.forEach((match) => cleanInvestorNames(match[1] ?? '').forEach((name) => push(name, true, match[0])));
  participantMatches.forEach((match) => cleanInvestorNames(match[1] ?? '').forEach((name) => push(name, false, match[0])));

  const deduped = new Map<string, InvestorRelationshipObservation>();
  observations.forEach((observation) => {
    const key = normalize(observation.investorName);
    const current = deduped.get(key);
    if (!current || observation.isLead || observation.confidenceScore > current.confidenceScore) deduped.set(key, observation);
  });
  return [...deduped.values()];
};

const capitalSignalsFromContext = (context: string, sourceUrl: string): PeopleCapitalSignal[] => {
  const text = sanitizePeopleCapitalText(context);
  const value = normalize(text);
  const evidenceText = text.slice(0, 700);
  const signals: PeopleCapitalSignal[] = [];
  const fidcEvent = /\bfidcs?\b|fundos? de investimento em direitos creditorios/.test(value)
    && /raised|captou|captacao|financing|funding|through|via|vehicle|veiculo/.test(value);
  if (fidcEvent) signals.push({ type: 'fidc_funding_event', strength: 97, confidenceScore: 0.9, evidenceText, sourceUrl });
  if (!fidcEvent && /debt round|debt financing|combining equity and debt|credit facility|structured debt|raised [^.!?]{0,120} debt|secured [^.!?]{0,120} financing/.test(value)) {
    signals.push({ type: 'structured_debt_funding', strength: 92, confidenceScore: 0.86, evidenceText, sourceUrl });
  }
  if (/\bbndes\b|\bfinep\b/.test(value) && /financing|funding|financiamento|credito/.test(value)) signals.push({ type: 'public_financing_signal', strength: 88, confidenceScore: 0.9, evidenceText, sourceUrl });
  if (/originations?|originacoes|originacao/.test(value) && /rose|grew|increased|cresceu|aumentou/.test(value)) signals.push({ type: 'credit_origination_acceleration', strength: 89, confidenceScore: 0.86, evidenceText, sourceUrl });
  return signals;
};

export const captureTechSignalsLatam = async (params: { companyName: string; legalName?: string; feedUrl: string; collectedAt?: string }): Promise<PeopleCapitalCapture> => {
  const collectedAt = params.collectedAt ?? new Date().toISOString();
  try {
    const response = await fetch(params.feedUrl, { headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': 'Mozilla/5.0 (compatible; OriginationIntelligence/1.0)' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Tech Signals RSS status ${response.status}`);
    const xml = await response.text();
    let matched: { link: string; publishedAt: string; context: string } | null = null;
    const aliases = [params.companyName, params.legalName ?? ''].filter(Boolean);
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 12).map((match) => match[1] ?? '');
    for (const item of items) {
      const content = rssField(item, 'content:encoded') || rssField(item, 'description');
      const context = companyContext(content, aliases);
      if (!context) continue;
      matched = { link: sanitizePeopleCapitalText(rssField(item, 'link')) || params.feedUrl, publishedAt: sanitizePeopleCapitalText(rssField(item, 'pubDate')) || collectedAt, context };
      break;
    }
    if (!matched) return { connectorStatus: 'real', matched: false, sourceUrl: params.feedUrl, collectedAt, jobs: [], headcount: null, investors: [], signals: [], metadata: { scannedEntries: items.length } };

    const observedAt = normalizeDate(matched.publishedAt) ?? collectedAt;
    const headcount = parseHeadcount(matched.context, matched.link, observedAt);
    const investors = parseFundingInvestors(matched.context, matched.link, observedAt);
    const signals = capitalSignalsFromContext(matched.context, matched.link);
    if (headcount?.growthPct !== null && headcount) signals.push({
      type: 'headcount_acceleration', strength: headcount.growthPct >= 20 ? 90 : headcount.growthPct >= 10 ? 84 : headcount.growthPct >= 5 ? 76 : 68,
      confidenceScore: headcount.confidenceScore, evidenceText: `${params.companyName}: headcount ${headcount.growthPct >= 0 ? '+' : ''}${headcount.growthPct}% no período, total ${headcount.total}.`, sourceUrl: matched.link,
    });
    if (investors.length) signals.push({ type: 'investor_relationship_signal', strength: 74, confidenceScore: 0.78, evidenceText: `${params.companyName}: ${investors.length} relação(ões) investidor↔empresa identificada(s) em rodada.`, sourceUrl: matched.link });
    return {
      connectorStatus: 'real', matched: true, sourceUrl: matched.link, collectedAt, jobs: [], headcount, investors, signals,
      metadata: { scannedEntries: items.length, publishedAt: observedAt, evidenceContext: matched.context.slice(0, 2400) },
    };
  } catch (error) {
    return { connectorStatus: 'partial', matched: false, sourceUrl: params.feedUrl, collectedAt, jobs: [], headcount: null, investors: [], signals: [], metadata: { error: error instanceof Error ? error.message : 'unknown_error' } };
  }
};
