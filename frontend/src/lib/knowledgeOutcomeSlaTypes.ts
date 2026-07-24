export type OutcomeOwnershipStatus = 'unclaimed' | 'mine' | 'assigned';
export type OutcomeSlaStatus = 'unclaimed' | 'without_sla' | 'due_soon' | 'on_track' | 'breached';
export type OutcomeQueueSource = 'pending' | 'adoption';
export type OutcomePriorityBand = 'immediate' | 'high' | 'review' | 'low';

export type OutcomeSlaItem = {
  activityId: string;
  companyId: string;
  companyName: string;
  title: string;
  description: string | null;
  activityType: string;
  queueSource: OutcomeQueueSource;
  nodeId: string | null;
  nodeTitle: string | null;
  canAdopt: boolean;
  priorityScore: number;
  priorityBand: OutcomePriorityBand;
  priorityReasons: string[];
  pipelineStage: string | null;
  expectedStructure: string | null;
  ownerName: string | null;
  taskOwnerUserId: string | null;
  taskOwnerDisplayName: string | null;
  assignmentStatus: OutcomeOwnershipStatus;
  isMine: boolean;
  claimedAt: string | null;
  slaDueAt: string | null;
  slaStatus: OutcomeSlaStatus;
  slaHoursRemaining: number | null;
  occurredAt: string | null;
};

export type OutcomeSlaSummary = {
  assignedItems: number;
  unassignedItems: number;
  myItems: number;
  breachedItems: number;
  dueSoonItems: number;
};

export type OutcomeSlaPolicy = {
  immediateHours: number;
  highHours: number;
  reviewHours: number;
  lowHours: number;
  basis: string;
};

export type OutcomeSlaWorkspace = {
  generatedAt: string;
  currentUserId: string;
  summary: OutcomeSlaSummary;
  myQueue: OutcomeSlaItem[];
  unclaimedQueue: OutcomeSlaItem[];
  breachedQueue: OutcomeSlaItem[];
  dueSoonQueue: OutcomeSlaItem[];
  slaPolicy: OutcomeSlaPolicy;
};

export type OutcomeClaimResult = {
  status: 'claimed' | 'already_claimed';
  activityId: string;
  taskId: string;
  ownerUserId: string;
  ownerDisplayName: string;
  claimedAt: string;
  slaDueAt: string;
  priorityBand: OutcomePriorityBand;
  instrumentationStatus?: string | null;
};

export type OutcomeReleaseResult = {
  status: 'released' | 'already_unclaimed';
  activityId: string;
  taskId: string;
};

export type OutcomeRescheduleResult = {
  status: 'rescheduled' | 'already_scheduled';
  activityId: string;
  taskId: string;
  previousSlaDueAt: string | null;
  slaDueAt: string;
};
