type PipelineStage = 'Identified' | 'Qualified' | 'Approach' | 'Structuring' | 'Mandated' | 'ClosedWon' | 'ClosedLost' | 'Recycled';
type ActivityType = 'follow_up' | 'meeting' | 'email' | 'call' | 'research' | 'committee' | 'other';
type ActivityStatus = 'open' | 'done' | 'cancelled';
type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
type Owner = 'Origination' | 'Coverage' | 'Analytics' | 'Intelligence' | 'Credit' | 'Unknown';

export type SearchProfileCandidate = {
  id: string;
  searchProfileId?: string;
  companyName: string;
  website?: string;
  segment: string;
  sourceRef: string;
  evidenceSummary: string;
  confidence: number;
  status?: 'captured' | 'promoted';
  candidateStatus?: 'captured' | 'deduped' | 'promoted' | 'discarded';
  promoted?: boolean;
  companyId?: string;
  isNewCandidate?: boolean;
  matchState?: 'new' | 'existing_candidate' | 'company_master';
  currentSearchSourceRef?: string;
  currentSearchEvidenceSummary?: string;
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
  status: 'queued' | 'running' | 'completed' | 'failed' | string;
  result: unknown;
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type AbaStatus = {
  runtime: string;
  commandCount: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  lastCommandAt: string | null;
  lastCompletedAt: string | null;
  commands: AbaCommandRecord[];
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

export type OriginationBacklogItem = {
  id: string;
  title: string;
  status: 'implemented' | 'runtime_ready' | 'documented';
  priority: string;
  implementation: string;
};

export type OriginationScoreCriterion = {
  criterion: string;
  weight: number;
  evidence: string[];
};

export type OriginationCommand = {
  command: string;
  output: string[];
};

export type OriginationOperatingSystem = {
  version: string;
  thesis: string;
  products: OriginationProduct[];
  structures?: Array<{ name: string; role: string }>;
  skills: OriginationSkill[];
  priorities?: Array<{ priority: string; definition: string; action: string }>;
  scorecard: OriginationScoreCriterion[];
  scoreActions?: Array<{ range: string; action: string }>;
  flows: OriginationFlow[];
  modules?: Array<{ id: string; name: string; purpose: string; implementedBy: string[] }>;
  routines?: Array<Record<string, unknown>>;
  backlog: OriginationBacklogItem[];
  hooks?: Record<string, unknown>;
  recyclingRules?: string[];
  initialVerticals: string[];
  checklist: string[];
  templates?: Record<string, unknown>;
  commands: OriginationCommand[];
  implementation?: Record<string, unknown>;
};
