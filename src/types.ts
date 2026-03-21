export type CompanyStage =
  | "growth"
  | "late_stage"
  | "middle_market"
  | "pre_ipo";

export type ScoreType =
  | "fit_dcm"
  | "momentum"
  | "readiness"
  | "relationship";

export type SignalType =
  | "funding"
  | "debt"
  | "hiring"
  | "governance"
  | "news"
  | "expansion"
  | "compliance";

export interface Evidence {
  summary: string;
  sourceName: string;
  sourceType: "public_web" | "news" | "manual" | "internal";
  collectedAt: string;
  url?: string;
}

export interface Score {
  type: ScoreType;
  value: number;
  rationale: string;
  confidence: number;
  updatedAt: string;
}

export interface MonitoringSignal {
  id: string;
  companyId: string;
  type: SignalType;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  createdAt: string;
  evidence: Evidence[];
}

export interface Company {
  id: string;
  legalName: string;
  tradingName: string;
  cnpj: string;
  sector: string;
  subsector: string;
  headquarters: string;
  stage: CompanyStage;
  website: string;
  thesisTags: string[];
  dcmThesis: string;
  fundingNeedIndicators: string[];
  governanceHighlights: string[];
  lastRefreshedAt: string;
}

export interface CompanyDetail extends Company {
  scores: Score[];
  signals: MonitoringSignal[];
}

export interface Watchlist {
  id: string;
  name: string;
  owner: string;
  companyIds: string[];
  createdAt: string;
}

export interface CompanyFilters {
  q?: string;
  sector?: string;
  stage?: CompanyStage;
  thesisTag?: string;
  minScore?: number;
}

export interface CreateCompanyInput {
  legalName: string;
  tradingName: string;
  cnpj: string;
  sector: string;
  subsector: string;
  headquarters: string;
  stage: CompanyStage;
  website: string;
  thesisTags: string[];
  dcmThesis: string;
  fundingNeedIndicators: string[];
  governanceHighlights: string[];
}

export interface CreateWatchlistInput {
  name: string;
  owner: string;
  companyIds: string[];
}

export interface RefreshCompanyInput {
  summary?: string;
}

export interface WatchlistDetail extends Watchlist {
  companies: Company[];
}

export interface SrmDatabase {
  companies: Company[];
  scores: Record<string, Score[]>;
  signals: MonitoringSignal[];
  watchlists: Watchlist[];
}
