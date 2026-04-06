import type { ActivityStatus, ActivityType, Owner, PipelineStage, TaskStatus } from '../types/platform.js';

export const PIPELINE_STAGES: PipelineStage[] = ['Identified', 'Qualified', 'Approach', 'Structuring', 'Mandated', 'ClosedWon', 'ClosedLost', 'Recycled'];
export const ACTIVITY_TYPES: ActivityType[] = ['follow_up', 'meeting', 'email', 'call', 'research', 'committee', 'other'];
export const ACTIVITY_STATUSES: ActivityStatus[] = ['open', 'done', 'cancelled'];
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done', 'blocked'];
export const OWNERS: Owner[] = ['Origination', 'Coverage', 'Analytics', 'Intelligence', 'Credit', 'Unknown'];

export const isPipelineStage = (value: string): value is PipelineStage => PIPELINE_STAGES.includes(value as PipelineStage);
export const isActivityType = (value: string): value is ActivityType => ACTIVITY_TYPES.includes(value as ActivityType);
export const isActivityStatus = (value: string): value is ActivityStatus => ACTIVITY_STATUSES.includes(value as ActivityStatus);
export const isTaskStatus = (value: string): value is TaskStatus => TASK_STATUSES.includes(value as TaskStatus);
export const asOwner = (value: unknown): Owner => (typeof value === 'string' && OWNERS.includes(value as Owner) ? value as Owner : 'Unknown');
