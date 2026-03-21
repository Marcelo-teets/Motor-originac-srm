export type ApiStatus = 'real' | 'partial' | 'mock';

export type Company = {
  id: string;
  name: string;
  segment: string;
  subsegment: string;
  geography: string;
  product: string;
  receivables: string[];
  qualificationScore: number;
  leadScore: number;
  leadBucket: string;
  monitoringStatus: string;
  suggestedStructure: string;
  thesis: string;
  nextAction: string;
};
