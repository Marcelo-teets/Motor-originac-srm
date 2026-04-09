export type ScraperConnectorStatus = 'real' | 'partial' | 'mock';

export type ScrapedPage = {
  url: string;
  pageType:
    | 'homepage'
    | 'about'
    | 'products'
    | 'enterprise'
    | 'partners'
    | 'pricing'
    | 'newsroom'
    | 'careers'
    | 'docs'
    | 'linkedin_company'
    | 'unknown';
  title: string;
  headings: string[];
  excerpt: string;
  rawText: string;
  status: ScraperConnectorStatus;
};

export type DetectedSignal = {
  type: string;
  strength: number;
  confidenceScore: number;
  matchedKeywords: string[];
  evidence: string[];
  sourceUrl: string;
  sourceType: 'company_website' | 'linkedin_company';
};

export type B2BSignalPackResult = {
  companyId: string;
  companyName: string;
  sourceId: string;
  sourceType: 'company_website' | 'linkedin_company';
  connectorStatus: ScraperConnectorStatus;
  collectedAt: string;
  pages: ScrapedPage[];
  consolidatedText: string;
  signals: DetectedSignal[];
  metadata: Record<string, unknown>;
};
