export type Stakeholder = {
  id: string;
  company_id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  role_in_buying_committee?: string;
  seniority?: string;
  champion_score: number;
  blocker_score: number;
  influence_score: number;
  relationship_strength: number;
  what_they_care_about?: string;
  known_objections?: string;
  last_contact_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type Touchpoint = {
  id: string;
  company_id: string;
  stakeholder_id?: string | null;
  owner_name?: string;
  channel: string;
  direction?: string;
  occurred_at: string;
  summary: string;
  raw_notes?: string;
  sentiment?: string;
  objection_raised: boolean;
  agreed_next_step?: string;
  next_step_due_at?: string;
  created_at?: string;
};

export type ObjectionInstance = {
  id: string;
  company_id: string;
  stakeholder_id?: string | null;
  touchpoint_id?: string | null;
  playbook_id?: string | null;
  objection_text: string;
  status: string;
  severity?: string;
  resolution_notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type MomentumResult = {
  momentum_score: number;
  momentum_status: 'accelerating' | 'stable' | 'cooling';
  rationale: string;
};

export type PriorityResult = {
  priority_score: number;
  priority_band: 'immediate' | 'high' | 'medium' | 'monitor';
  rationale: string;
};
