import type { SearchProfile } from '../types/platform.js';
import type { SearchProfileCaptureSummary } from './searchProfileCaptureService.js';

export type SearchProfileBootstrapDeps = {
  listSearchProfiles(): Promise<SearchProfile[]>;
  runCapture(searchProfileId: string, triggerMode: 'bootstrap'): Promise<SearchProfileCaptureSummary>;
};

export type SearchProfileBootstrapOptions = {
  profileIds?: string[];
  maxProfiles?: number;
};

export type SearchProfileBootstrapResult = {
  searchProfileId: string;
  profileName: string;
  status: 'completed' | 'failed';
  candidatesFound: number;
  candidatesInserted: number;
  note?: string;
};

export type SearchProfileBootstrapSummary = {
  activeProfiles: number;
  selectedProfiles: number;
  completed: number;
  failed: number;
  candidatesFound: number;
  candidatesInserted: number;
  results: SearchProfileBootstrapResult[];
};

export async function runSearchProfileBootstrap(
  deps: SearchProfileBootstrapDeps,
  options: SearchProfileBootstrapOptions = {},
): Promise<SearchProfileBootstrapSummary> {
  const profiles = await deps.listSearchProfiles();
  const active = profiles.filter((profile) => profile.status === 'active');
  const requested = new Set((options.profileIds ?? []).filter(Boolean));
  const scoped = requested.size
    ? active.filter((profile) => requested.has(profile.id))
    : active;
  const maxProfiles = Math.max(1, Math.min(Math.trunc(options.maxProfiles ?? scoped.length || 1), 100));
  const selected = scoped.slice(0, maxProfiles);
  const results: SearchProfileBootstrapResult[] = [];

  for (const profile of selected) {
    try {
      const capture = await deps.runCapture(profile.id, 'bootstrap');
      const failed = capture.run.runStatus === 'failed';
      results.push({
        searchProfileId: profile.id,
        profileName: profile.name,
        status: failed ? 'failed' : 'completed',
        candidatesFound: capture.run.candidatesFound,
        candidatesInserted: capture.run.candidatesInserted,
        note: capture.run.notes,
      });
    } catch (error) {
      results.push({
        searchProfileId: profile.id,
        profileName: profile.name,
        status: 'failed',
        candidatesFound: 0,
        candidatesInserted: 0,
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    activeProfiles: active.length,
    selectedProfiles: selected.length,
    completed: results.filter((item) => item.status === 'completed').length,
    failed: results.filter((item) => item.status === 'failed').length,
    candidatesFound: results.reduce((sum, item) => sum + item.candidatesFound, 0),
    candidatesInserted: results.reduce((sum, item) => sum + item.candidatesInserted, 0),
    results,
  };
}
