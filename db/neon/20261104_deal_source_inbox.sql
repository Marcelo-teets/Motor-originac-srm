-- Deal Card source inbox. Additive; not executed in production by this PR.
-- Unassociated source metadata is owned by a person, not exposed by company name.
-- No message bodies, email addresses, full transcripts or attachments in this table.
create table if not exists public.dcm_source_intake (
  id uuid primary key default gen_random_uuid(),
  submitted_by text not null,
  provider text not null check (provider in (
    'fireflies','teams','outlook_email','outlook_calendar',
    'sharepoint','client_folder','crm','manual'
  )),
  external_id text not null check (length(external_id) between 1 and 400),
  title text not null check (length(title) between 1 and 240),
  source_ref text,
  occurred_at timestamptz,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  suggested_opportunity_id uuid references public.dcm_opportunities(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','linked','ignored')),
  linked_opportunity_id uuid references public.dcm_opportunities(id) on delete restrict,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1 check (seen_count > 0),
  reviewed_by text,
  reviewed_at timestamptz,
  resolution_note text,
  unique (submitted_by,provider,external_id,content_sha256),
  check (
    (status = 'pending' and linked_opportunity_id is null and reviewed_at is null)
    or
    (status = 'linked' and linked_opportunity_id is not null and reviewed_at is not null and reviewed_by is not null)
    or
    (status = 'ignored' and linked_opportunity_id is null and reviewed_at is not null and reviewed_by is not null)
  ),
  check (status = 'pending' or length(coalesce(resolution_note,'')) >= 10)
);
create index if not exists dcm_source_intake_owner_status
  on public.dcm_source_intake(submitted_by,status,last_seen_at desc);
create index if not exists dcm_source_intake_suggested_deal
  on public.dcm_source_intake(suggested_opportunity_id) where suggested_opportunity_id is not null;

-- Append-only decisions: attribution is never silent, overwritten or inherited by revisits.
create table if not exists public.dcm_source_intake_decisions (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.dcm_source_intake(id) on delete restrict,
  decision text not null check (decision in ('linked','ignored')),
  actor_user_id text not null,
  opportunity_id uuid references public.dcm_opportunities(id) on delete restrict,
  note text not null check (length(note) >= 10),
  decided_at timestamptz not null default now(),
  check ((decision = 'linked' and opportunity_id is not null)
    or (decision = 'ignored' and opportunity_id is null))
);
create index if not exists dcm_source_intake_decisions_source
  on public.dcm_source_intake_decisions(intake_id,decided_at desc);

-- Default-deny: all access must go through authenticated server membership checks.
alter table public.dcm_source_intake enable row level security;
alter table public.dcm_source_intake_decisions enable row level security;
comment on table public.dcm_source_intake is
  'Private, minimally identifying source metadata awaiting explicit deal association. No source body or transcript.';
comment on table public.dcm_source_intake_decisions is
  'Append-only human attribution and discard decisions. No automatic matching permissions.';

-- Even the application DB role cannot modify or remove recorded decisions.
-- A superuser/database administrator can still perform authorized maintenance.
create or replace function public.dcm_block_source_intake_decision_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Deal source intake decisions are append-only';
end
$$;
drop trigger if exists dcm_source_intake_decisions_immutable on public.dcm_source_intake_decisions;
create trigger dcm_source_intake_decisions_immutable
before update or delete on public.dcm_source_intake_decisions
for each row execute function public.dcm_block_source_intake_decision_mutation();
