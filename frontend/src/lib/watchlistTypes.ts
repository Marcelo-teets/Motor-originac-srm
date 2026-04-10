export type WatchList = {
  id: string;
  name: string;
  description?: string;
  isShared: boolean;
  itemCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type WatchListItem = {
  id: string;
  watchlistId: string;
  companyId: string;
  companyName?: string;
  addedBy?: string;
  priorityLabel?: string;
  notes?: string;
  addedAt: string;
  qualificationScore?: number;
  leadScore?: number;
  suggestedStructure?: string;
  topPattern?: string;
  triggerStrength?: number;
};

export type WatchListUpdate = {
  watchlistId: string;
  companyId: string;
  companyName: string;
  updateType: string;
  summary: string;
  delta?: number;
  observedAt: string;
};
