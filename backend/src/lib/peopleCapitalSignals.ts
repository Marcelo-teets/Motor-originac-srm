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

const parseDecimal = (raw: string) => {
  const value = raw.trim().replace(/\s+/g, '');
  if (!value) return Number.NaN;
  if (/^-?\d{1,3}(?:[.,]\d{3})+$/.test(value)) return Number(value.replace(/[.,]/g, ''));
  if (/^-?\d+[.,]\d+$/.test(value)) return Number(value.replace(',', '.'));
  return Number(value.replace(/[^\d.-]/g, ''));
};

const normalizeOptionalDate = (value: string) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
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
  if (/senior|sr\b|especialista|principal/.test(value)) return 'senior';
  if (/junior|jr\b|estagio|intern/.test(value)) return 'junior';
  return 'unspecified';
};

const roleScores = (family: string) => {
  const dcm: Record<string, number> = {
    capital_markets: 100,
    funding: 96,
    treasury: 90,
    credit: 82,
    risk: 78,
    underwriting: 84,
    collections: 62,
    finance: 48,
    other: 8,
  };
  const credit: Record<string, number> = {
    credit: 100,
    risk: 94,
    underwriting: 98,
    collections: 84,
    capital_markets: 88,
    funding: 90,
    treasury: 78,
    finance: 52,
    other: 8,
  };
  return { dcm: dcm[family] ?? 8, credit: credit[family] ?? 8 };
};

const absoluteUrl = (href: string, baseUrl: string) => {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
};

const asString = (value: unknown) => typeof value === 'string' ? sanitizePeopleCapitalText(value) : '';

const collectJobPostingObjects = (value: unknown, output: Record<string, unknown>[]) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJobPostingObjects(item, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const type = record['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) output.push(record);
  if (Array.isArray(record['@graph'])) collectJobPostingObjects(record['@graph'], output);
};

const jobFromJsonLd = (job: Record<string, unknown>, baseUrl: string): JobOpeningObservation | null => {
  const title = asString(job.title ?? job.name);
  if (!title) return null;
  const family = classifyRoleFamily(title);
  const scores = roleScores(family);
  const locationObject = (job.jobLocation && typeof job.jobLocation === 'object') ? job.jobLocation as Record<string, unknown> : null;
  const addressObject = (locationObject?.address && typeof locationObject.address === 'object') ? locationObject.address as Record<string, unknown> : null;
  const location = [addressObject?.addressLocality, addressObject?.addressRegion, addressObject?.addressCountry]
    .map(asString)
    .filter(Boolean)
    .join(', ') || null;
  const sourceUrl = absoluteUrl(asString(job.url) || baseUrl, baseUrl);
  const identifier = typeof job.identifier === 'object' && job.identifier
    ? asString((job.identifier as Record<string, unknown>).value)
    : asString(job.identifier);
  const externalJobId = identifier || stableTextKey(`${title}|${location ?? ''}|${sourceUrl}`);

  return {
    externalJobId,
    title,
    normalizedTitle: normalize(title),
    roleFamily: family,
    seniority: inferSeniority(title),
    location,
    employmentType: asString(job.employmentType) || null,
    sourceUrl,
    openedAt: normalizeOptionalDate(asString(job.datePosted)),
    dcmRelevanceScore: scores.dcm,
    creditRelevanceScore: scores.credit,
    confidenceScore: 0.9,
    rawPayload: job,
  };
};

export const extractJobOpenings = (html: string, baseUrl: string) => {
  const jobs: JobOpeningObservation[] = [];
  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const block of jsonLdBlocks) {
    try {
      const parsed = JSON.parse(decodeEntities(block[1] ?? '')) as unknown;
      const postingObjects: Record<string, unknown>[] = [];
      collectJobPostingObjects(parsed, postingObjects);
      postingObjects.forEach((posting) => {
        const job = jobFromJsonLd(posting, baseUrl);
        if (job) jobs.push(job);
      });
    } catch {
      // Invalid JSON-LD is ignored; anchor fallback below still captures public openings.
    }
  }

  const jobHrefPattern = /jobs?|careers?|carreiras?|vagas?|positions?|openings?|greenhouse|lever|ashby|gupy|workday/i;
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{1,400}?)<\/a>/gi)) {
    const href = match[1] ?? '';
    const title = sanitizePeopleCapitalText(match[2] ?? '');
    if (!jobHrefPattern.test(href) || title.length < 4 || title.length > 180) continue;
    if (/^(careers?|carreiras?|jobs?|vagas?|ver vagas|see jobs|open positions)$/i.test(title)) continue;
    const sourceUrl = absoluteUrl(href, baseUrl);
    const family = classifyRoleFamily(title);
    const scores = roleScores(family);
    jobs.push({
      externalJobId: stableTextKey(`${title}|${sourceUrl}`),
      title,
      normalizedTitle: normalize(title),
      roleFamily: family,
      seniority: inferSeniority(title),
      location: null,
      employmentType: null,
      sourceUrl,
      openedAt: null,
      dcmRelevanceScore: scores.dcm,
      creditRelevanceScore: scores.credit,
      confidenceScore: 0.68,
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
  if (!jobs.length) return [];
  const counts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.roleFamily] = (acc[job.roleFamily] ?? 0) + 1;
    return acc;
  }, {});
  const strategic = jobs.filter((job) => job.dcmRelevanceScore >= 60);
  const output: PeopleCapitalSignal[] = [];

  if ((counts.capital_markets ?? 0) > 0) output.push({
    type: 'capital_markets_hiring', strength: 92, confidenceScore: 0.88,
    evidenceText: `${counts.capital_markets} vaga(s) aberta(s) diretamente em Capital Markets/DCM.`, sourceUrl,
  });
  if ((counts.funding ?? 0) + (counts.treasury ?? 0) > 0) output.push({
    type: 'funding_team_hiring', strength: 90, confidenceScore: 0.86,
    evidenceText: `${(counts.funding ?? 0) + (counts.treasury ?? 0)} vaga(s) aberta(s) em Funding/Tesouraria.`, sourceUrl,
  });
  const creditBuildout = (counts.credit ?? 0) + (counts.risk ?? 0) + (counts.underwriting ?? 0) + (counts.collections ?? 0);
  if (creditBuildout > 0) output.push({
    type: 'credit_team_hiring', strength: Math.min(94, 78 + creditBuildout * 3), confidenceScore: 0.86,
    evidenceText: `${creditBuildout} vaga(s) aberta(s) em Crédito/Risco/Underwriting/Cobrança.`, sourceUrl,
  });
  if (strategic.length >= 3) output.push({
    type: 'credit_infrastructure_buildout', strength: Math.min(95, 82 + strategic.length * 2), confidenceScore: 0.84,
    evidenceText: `${strategic.length} vagas estratégicas ligadas a crédito/funding/DCM indicam construção de infraestrutura financeira.`, sourceUrl,
  });
  return output;
};

export const captureCompanyCareers = async (params: {
  companyName: string;
  website: string;
  collectedAt?: string;
}): Promise<PeopleCapitalCapture> => {
  const collectedAt = params.collectedAt ?? new Date().toISOString();
  const base = params.website.startsWith('http') ? params.website : `https://${params.website}`;
  const paths = ['/careers', '/carreiras', '/jobs', '/vagas', '/work-with-us', '/trabalhe-conosco'];
  const pages: Array<{ url: string; jobs: JobOpeningObservation[] }> = [];
  let successfulFetches = 0;

  await Promise.all(paths.map(async (path) => {
    const url = new URL(path, base).toString();
    try {
      const response = await fetch(url, {
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 (compatible; OriginationIntelligence/1.0)' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) return;
      successfulFetches += 1;
      const html = await response.text();
      pages.push({ url: response.url || url, jobs: extractJobOpenings(html, response.url || url) });
    } catch {
      // A company may use only one of these paths. Individual failures are non-fatal.
    }
  }));

  const jobs = new Map<string, JobOpeningObservation>();
  pages.flatMap((page) => page.jobs).forEach((job) => jobs.set(`${job.externalJobId}|${job.normalizedTitle}`, job));
  const jobList = [...jobs.values()];
  const sourceUrl = pages[0]?.url ?? base;
  const signals = signalsFromJobs(jobList, sourceUrl);

  return {
    connectorStatus: successfulFetches > 0 ? 'real' : 'partial',
    matched: successfulFetches > 0,
    sourceUrl,
    collectedAt,
    jobs: jobList,
    headcount: null,
    investors: [],
    signals,
    metadata: {
      companyName: params.companyName,
      successfulCareerPages: successfulFetches,
      attemptedPaths: paths,
      pages: pages.map((page) => ({ url: page.url, jobs: page.jobs.length })),
      openJobs: jobList.length,
      strategicOpenJobs: jobList.filter((job) => job.dcmRelevanceScore >= 60).length,
      roleFamilies: jobList.reduce<Record<string, number>>((acc, job) => {
        acc[job.roleFamily] = (acc[job.roleFamily] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };
};

const rssField = (item: string, tag: string) => {
  const escaped = tag.replace(':', '\\:');
  const match = item.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return decodeEntities(match?.[1] ?? '').trim();
};

const periodFromText = (text: string): HeadcountObservation['periodLabel'] => {
  const value = normalize(text);
  if (/quarter|trimestre|three months|3 months/.test(value)) return 'quarter';
  if (/month|mes|30 days/.test(value)) return 'month';
  return 'unknown';
};

const parseHeadcount = (context: string, sourceUrl: string, observedAt: string): HeadcountObservation | null => {
  const text = sanitizePeopleCapitalText(context);
  const patterns = [
    /~?(\d+(?:[.,]\d+)?)%\s+(?:headcount\s+)?(?:growth|increase|expansion)[^.!?]{0,180}?(?:reaching|reached|to|at|total(?:\s+of)?)\s+(?:a\s+)?(?:total\s+of\s+)?([\d.,]+)\s+(?:employees|people|team members)/i,
    /(?:headcount|team)[^.!?]{0,120}?~?(\d+(?:[.,]\d+)?)%[^.!?]{0,180}?([\d.,]+)\s+(?:employees|people|team members)/i,
  ];
  const match = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  if (!match) return null;
  const growthPct = Number(String(match[1]).replace(',', '.'));
  const total = parseDecimal(String(match[2]));
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(growthPct) || growthPct < -100 || growthPct > 1000) return null;
  const inferredPreviousTotal = growthPct > -100 ? Math.max(0, Math.round(total / (1 + growthPct / 100))) : null;
  return {
    total: Math.round(total),
    growthPct,
    inferredPreviousTotal,
    periodLabel: periodFromText(text),
    observedAt,
    sourceUrl,
    confidenceScore: 0.82,
    evidenceText: match[0].trim(),
  };
};

const parseAmount = (currencyRaw: string, amountRaw: string, multiplierRaw: string) => {
  const normalizedAmount = parseDecimal(amountRaw);
  if (!Number.isFinite(normalizedAmount)) return null;
  const multiplier = /b|billion|bilhao|bilhoes/i.test(multiplierRaw) ? 1_000_000_000
    : /m|million|milhao|milhoes/i.test(multiplierRaw) ? 1_000_000
      : /k|thousand|mil/i.test(multiplierRaw) ? 1_000 : 1;
  const currency = /r\$/i.test(currencyRaw) ? 'BRL' : /us\$|usd|\$/i.test(currencyRaw) ? 'USD' : null;
  return { amount: normalizedAmount * multiplier, currency };
};

const cleanInvestorNames = (value: string) => value
  .replace(/\s+(?:and|e)\s+/gi, ',')
  .replace(/\s+alongside\s+/gi, ',')
  .split(',')
  .map((name) => name.replace(/^(?:the|a|an)\s+/i, '').trim())
  .map((name) => name.replace(/\s+(?:also\s+)?participated.*$/i, '').trim())
  .filter((name) => name.length >= 2 && name.length <= 90)
  .filter((name) => !/^(?:other |additional )?(?:financial-sector )?investors?$|undisclosed|investment round|funding round/i.test(name.toLowerCase()));

const dedupeInvestorObservations = (observations: InvestorRelationshipObservation[]) => {
  const deduped = new Map<string, InvestorRelationshipObservation>();
  for (const observation of observations) {
    const key = normalize(observation.investorName);
    if (!key) continue;
    const existing = deduped.get(key);
    if (!existing || observation.isLead || observation.confidenceScore > existing.confidenceScore) deduped.set(key, observation);
  }
  return [...deduped.values()];
};

const parseFundingInvestors = (context: string, sourceUrl: string, announcedAt: string | null) => {
  const text = sanitizePeopleCapitalText(context);
  if (!/raised|funding round|series\s+[a-z]|seed round|captou|rodada|secured .*financing/i.test(text)) return [] as InvestorRelationshipObservation[];
  const stage = text.match(/\b(series\s+[a-z0-9]+|pre-seed|seed|growth|series\s+[a-z])\b/i)?.[1] ?? null;
  const amountMatch = text.match(/(?:raised|captou|rodada|secured)[^.!?]{0,100}?(US\$|USD|R\$|\$)?\s*([\d.,]+)\s*(B|M|K|billion|million|thousand|bilh(?:ao|oes)|milh(?:ao|oes)|mil)?/i);
  const parsedAmount = amountMatch ? parseAmount(amountMatch[1] ?? '', amountMatch[2] ?? '', amountMatch[3] ?? '') : null;
  const leadMatch = text.match(/led by\s+([^.;]+?)(?=\s+with participation|\s+alongside|\s+and participation|[.;]|$)/i);
  const participantMatches = [
    text.match(/(?:with participation from|participation from|alongside)\s+([^.;]+)/i),
    text.match(/([^.]{2,900}?)\s+(?:also\s+)?participated(?:\s+in\s+the\s+round)?[.;]/i),
    text.match(/backed by\s+([^.;]+)/i),
  ].filter((match): match is RegExpMatchArray => Boolean(match));
  const observations: InvestorRelationshipObservation[] = [];

  cleanInvestorNames(leadMatch?.[1] ?? '').forEach((investorName) => observations.push({
    investorName,
    relationshipType: 'lead_investor',
    roundStage: stage,
    roundAmount: parsedAmount?.amount ?? null,
    roundCurrency: parsedAmount?.currency ?? null,
    isLead: true,
    announcedAt,
    sourceUrl,
    confidenceScore: 0.82,
    evidenceText: leadMatch?.[0] ?? text.slice(0, 400),
  }));

  for (const participantMatch of participantMatches) {
    cleanInvestorNames(participantMatch[1] ?? '').forEach((investorName) => observations.push({
      investorName,
      relationshipType: 'participant_investor',
      roundStage: stage,
      roundAmount: parsedAmount?.amount ?? null,
      roundCurrency: parsedAmount?.currency ?? null,
      isLead: false,
      announcedAt,
      sourceUrl,
      confidenceScore: 0.78,
      evidenceText: participantMatch[0] ?? text.slice(0, 400),
    }));
  }

  return dedupeInvestorObservations(observations);
};

const companyContext = (text: string, aliases: string[]) => {
  const clean = sanitizePeopleCapitalText(text);
  const normalized = normalize(clean);
  const normalizedAliases = aliases.map(normalize).filter((alias) => alias.length >= 3);
  const alias = normalizedAliases.find((candidate) => normalized.includes(candidate));
  if (!alias) return null;
  const index = normalized.indexOf(alias);
  const ratio = normalized.length ? index / normalized.length : 0;
  const approximateIndex = Math.floor(clean.length * ratio);
  return clean.slice(Math.max(0, approximateIndex - 600), Math.min(clean.length, approximateIndex + 3200));
};

export const captureTechSignalsLatam = async (params: {
  companyName: string;
  legalName?: string;
  feedUrl: string;
  collectedAt?: string;
}): Promise<PeopleCapitalCapture> => {
  const collectedAt = params.collectedAt ?? new Date().toISOString();
  const aliases = [params.companyName, params.legalName ?? ''].filter(Boolean);
  try {
    const response = await fetch(params.feedUrl, {
      headers: { accept: 'application/rss+xml, application/xml, text/xml', 'user-agent': 'Mozilla/5.0 (compatible; OriginationIntelligence/1.0)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Tech Signals RSS status ${response.status}`);
    const xml = await response.text();
    const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 12).map((match) => match[1] ?? '');
    let matchedEntry: { link: string; publishedAt: string; context: string } | null = null;

    for (const item of itemBlocks) {
      const title = rssField(item, 'title');
      const description = rssField(item, 'description');
      const content = rssField(item, 'content:encoded');
      const link = sanitizePeopleCapitalText(rssField(item, 'link')) || params.feedUrl;
      const publishedAt = sanitizePeopleCapitalText(rssField(item, 'pubDate')) || collectedAt;
      const context = companyContext(`${title} ${description} ${content}`, aliases);
      if (context) {
        matchedEntry = { link, publishedAt, context };
        break;
      }
    }

    if (!matchedEntry) return {
      connectorStatus: 'real', matched: false, sourceUrl: params.feedUrl, collectedAt,
      jobs: [], headcount: null, investors: [], signals: [], metadata: { scannedEntries: itemBlocks.length },
    };

    const observedAt = Number.isNaN(Date.parse(matchedEntry.publishedAt)) ? collectedAt : new Date(matchedEntry.publishedAt).toISOString();
    const headcount = parseHeadcount(matchedEntry.context, matchedEntry.link, observedAt);
    const investors = parseFundingInvestors(matchedEntry.context, matchedEntry.link, observedAt);
    const signals: PeopleCapitalSignal[] = [];

    if (headcount?.growthPct !== null && headcount) {
      const strength = headcount.growthPct >= 20 ? 90 : headcount.growthPct >= 10 ? 84 : headcount.growthPct >= 5 ? 76 : 68;
      signals.push({
        type: 'headcount_acceleration', strength, confidenceScore: headcount.confidenceScore,
        evidenceText: `${params.companyName}: headcount ${headcount.growthPct >= 0 ? '+' : ''}${headcount.growthPct}% no período, total ${headcount.total}.`,
        sourceUrl: matchedEntry.link,
      });
    }
    if (investors.length) signals.push({
      type: 'investor_relationship_signal', strength: 74, confidenceScore: 0.78,
      evidenceText: `${params.companyName}: ${investors.length} relação(ões) investidor↔empresa identificada(s) em rodada.`,
      sourceUrl: matchedEntry.link,
    });

    return {
      connectorStatus: 'real', matched: true, sourceUrl: matchedEntry.link, collectedAt,
      jobs: [], headcount, investors, signals,
      metadata: { scannedEntries: itemBlocks.length, publishedAt: observedAt, evidenceContext: matchedEntry.context.slice(0, 2400) },
    };
  } catch (error) {
    return {
      connectorStatus: 'partial', matched: false, sourceUrl: params.feedUrl, collectedAt,
      jobs: [], headcount: null, investors: [], signals: [],
      metadata: { error: error instanceof Error ? error.message : 'unknown_error' },
    };
  }
};
