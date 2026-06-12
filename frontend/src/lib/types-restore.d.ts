import './types';

declare module './types' {
  export type SearchProfileCandidate = {
    id: string;
    searchProfileId: string;
    companyName: string;
    website?: string;
    segment: string;
    sourceRef: string;
    evidenceSummary: string;
    confidence: number;
    status: 'captured' | 'promoted';
    promoted: boolean;
    capturedAt: string;
    promotedAt?: string;
  };

  export type SearchProfileDraft = {
    segment: string;
    subsegment: string;
    companyType: string;
    geography: string;
    creditProduct: string;
    receivables: string;
    targetStructure: string;
    signalIntensity: string;
    minimumConfidence: string;
    timeWindow: string;
  };

  export type MonitoringSnapshot = {
    recentTriggers: Array<{ company: string; signal: string; source: string; strength: number; when: string }>;
    latestRuns: Array<{ workflow: string; status: string; detail: string; when: string }>;
    activeSources: Array<{ name: string; status: string; health: string; coverage: string }>;
  };

  export type AgentsSnapshot = {
    items: Array<{ name: string; status: string; failures: number; confidence: number; focus: string; updatedAt: string }>;
  };

  export type PipelineSnapshot = {
    stages: Array<{ stage: string; count: number; note: string }>;
    recentActivities: Array<{ company: string; title: string; owner: string; when: string; status: string }>;
  };

  export type PipelineRow = {
    id: string;
    companyId: string;
    stage: PipelineStage;
    owner: Owner;
    nextAction: string;
    createdAt: string;
    updatedAt: string;
  };

  export type ActivityRecord = {
    id: string;
    companyId: string;
    type: ActivityType;
    title: string;
    description: string;
    owner: Owner;
    status: ActivityStatus;
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
  };

  export type TaskRecord = {
    id: string;
    companyId: string;
    title: string;
    description: string;
    owner: Owner;
    status: TaskStatus;
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
  };

  export type AbaCommandRecord = {
    id: string;
    target: 'aba' | 'paper_clip' | 'adm';
    action: string;
    context: Record<string, unknown>;
    status: string;
    result: string;
    createdAt: string;
    finishedAt?: string;
  };

  export type AbaStatus = {
    abaEnabled: boolean;
    capabilities: string[];
    commandTargets: string[];
    lastCommands: AbaCommandRecord[];
    suggestedImprovements: Array<{ id: string; title: string; reason: string; owner: string; priority: string }>;
  };

  export type OriginationProduct = {
    product: string;
    useCase: string;
    idealCompanyProfile: string[];
    qualificationSignals: string[];
  };

  export type OriginationSkill = {
    id: string;
    name: string;
    objective: string;
    inputs: string[];
    outputs: string[];
    tasks: string[];
  };

  export type OriginationFlow = {
    id: string;
    name: string;
    steps: string[];
  };

  export type OriginationOperatingSystem = {
    products: OriginationProduct[];
    skills: OriginationSkill[];
    flows: OriginationFlow[];
  };
}
