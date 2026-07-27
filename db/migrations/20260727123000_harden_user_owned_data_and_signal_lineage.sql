begin;

-- 1. Explicit ownership for user-private application data.
alter table public.ai_conversations
  add column if not exists owner_user_id uuid;

alter table public.notifications
  add column if not exists owner_user_id uuid;

alter table public.ai_conversations
  drop constraint if exists ai_conversations_owner_user_id_fkey;
alter table public.ai_conversations
  add constraint ai_conversations_owner_user_id_fkey
  foreign key (owner_user_id) references public.user_profiles(id) on delete set null;

alter table public.notifications
  drop constraint if exists notifications_owner_user_id_fkey;
alter table public.notifications
  add constraint notifications_owner_user_id_fkey
  foreign key (owner_user_id) references public.user_profiles(id) on delete set null;

create index if not exists idx_ai_conversations_owner_user_updated
  on public.ai_conversations (owner_user_id, updated_at desc);

create index if not exists idx_notifications_owner_user_unread
  on public.notifications (owner_user_id, is_read, created_at desc);

-- Recover ownership from legacy owner_name where it contains an id, e-mail or full name.
update public.ai_conversations conversation
set owner_user_id = profile.id
from public.user_profiles profile
where conversation.owner_user_id is null
  and conversation.owner_name is not null
  and (
    conversation.owner_name = profile.id::text
    or lower(conversation.owner_name) = lower(coalesce(profile.email, ''))
    or lower(conversation.owner_name) = lower(coalesce(profile.full_name, ''))
  );

update public.notifications notification
set owner_user_id = profile.id
from public.user_profiles profile
where notification.owner_user_id is null
  and notification.owner_name is not null
  and (
    notification.owner_name = profile.id::text
    or lower(notification.owner_name) = lower(coalesce(profile.email, ''))
    or lower(notification.owner_name) = lower(coalesce(profile.full_name, ''))
  );

-- There is currently one protected GOD-MODE profile. Attribute legacy team/system rows
-- to that profile only when the single-owner invariant is true.
with sole_god as (
  select min(id) as id
  from public.user_profiles
  where role = 'god_mode' and status = 'active'
  having count(*) = 1
)
update public.ai_conversations conversation
set owner_user_id = sole_god.id
from sole_god
where conversation.owner_user_id is null;

with sole_god as (
  select min(id) as id
  from public.user_profiles
  where role = 'god_mode' and status = 'active'
  having count(*) = 1
)
update public.notifications notification
set owner_user_id = sole_god.id
from sole_god
where notification.owner_user_id is null;

create or replace function private.guard_user_owned_record()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
begin
  -- service_role and trusted database jobs do not carry an end-user uid.
  if request_user_id is null then
    return new;
  end if;

  if new.owner_user_id is null then
    new.owner_user_id := request_user_id;
  end if;

  if not private.is_god_mode(request_user_id)
     and new.owner_user_id is distinct from request_user_id then
    raise exception 'record_owner_forbidden' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and old.owner_user_id is distinct from new.owner_user_id
     and not private.is_god_mode(request_user_id) then
    raise exception 'record_owner_change_forbidden' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_user_owned_record() from public, anon, authenticated;

drop trigger if exists trg_guard_ai_conversation_owner on public.ai_conversations;
create trigger trg_guard_ai_conversation_owner
before insert or update of owner_user_id on public.ai_conversations
for each row execute function private.guard_user_owned_record();

drop trigger if exists trg_guard_notification_owner on public.notifications;
create trigger trg_guard_notification_owner
before insert or update of owner_user_id on public.notifications
for each row execute function private.guard_user_owned_record();

comment on column public.ai_conversations.owner_user_id is
  'Authenticated owner used by RLS. owner_name remains a display/legacy field.';
comment on column public.notifications.owner_user_id is
  'Authenticated recipient used by RLS. owner_name remains a display/team label.';

-- 2. Replace authentication-only policies with actual row authorization.
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_agent_runs enable row level security;
alter table public.notifications enable row level security;

drop policy if exists ai_conv_all_authed on public.ai_conversations;
drop policy if exists ai_conversations_select_owner_or_god on public.ai_conversations;
drop policy if exists ai_conversations_insert_owner_or_god on public.ai_conversations;
drop policy if exists ai_conversations_update_owner_or_god on public.ai_conversations;
drop policy if exists ai_conversations_delete_owner_or_god on public.ai_conversations;

create policy ai_conversations_select_owner_or_god
on public.ai_conversations for select to authenticated
using (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy ai_conversations_insert_owner_or_god
on public.ai_conversations for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy ai_conversations_update_owner_or_god
on public.ai_conversations for update to authenticated
using (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
)
with check (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy ai_conversations_delete_owner_or_god
on public.ai_conversations for delete to authenticated
using (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

drop policy if exists ai_messages_all_authed on public.ai_messages;
drop policy if exists ai_messages_select_owner_or_god on public.ai_messages;
drop policy if exists ai_messages_insert_owner_or_god on public.ai_messages;
drop policy if exists ai_messages_update_owner_or_god on public.ai_messages;
drop policy if exists ai_messages_delete_owner_or_god on public.ai_messages;

create policy ai_messages_select_owner_or_god
on public.ai_messages for select to authenticated
using (
  private.is_god_mode((select auth.uid()))
  or exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.owner_user_id = (select auth.uid())
  )
);

create policy ai_messages_insert_owner_or_god
on public.ai_messages for insert to authenticated
with check (
  private.is_god_mode((select auth.uid()))
  or exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.owner_user_id = (select auth.uid())
  )
);

create policy ai_messages_update_owner_or_god
on public.ai_messages for update to authenticated
using (
  private.is_god_mode((select auth.uid()))
  or exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.owner_user_id = (select auth.uid())
  )
)
with check (
  private.is_god_mode((select auth.uid()))
  or exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.owner_user_id = (select auth.uid())
  )
);

create policy ai_messages_delete_owner_or_god
on public.ai_messages for delete to authenticated
using (
  private.is_god_mode((select auth.uid()))
  or exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.owner_user_id = (select auth.uid())
  )
);

drop policy if exists ai_agent_runs_all_authed on public.ai_agent_runs;
drop policy if exists ai_agent_runs_select_owner_or_god on public.ai_agent_runs;

create policy ai_agent_runs_select_owner_or_god
on public.ai_agent_runs for select to authenticated
using (
  private.is_god_mode((select auth.uid()))
  or exists (
    select 1
    from public.ai_conversations conversation
    where conversation.id = ai_agent_runs.conversation_id
      and conversation.owner_user_id = (select auth.uid())
  )
);

drop policy if exists notifications_insert_system on public.notifications;
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_insert_owner_or_god on public.notifications;
drop policy if exists notifications_select_owner_or_god on public.notifications;
drop policy if exists notifications_update_owner_or_god on public.notifications;
drop policy if exists notifications_delete_owner_or_god on public.notifications;

create policy notifications_select_owner_or_god
on public.notifications for select to authenticated
using (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy notifications_insert_owner_or_god
on public.notifications for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy notifications_update_owner_or_god
on public.notifications for update to authenticated
using (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
)
with check (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy notifications_delete_owner_or_god
on public.notifications for delete to authenticated
using (
  owner_user_id = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

-- Explicit Data API privileges: no anonymous access and no broad DDL-like privileges.
revoke all privileges on table public.ai_conversations from anon, authenticated;
revoke all privileges on table public.ai_messages from anon, authenticated;
revoke all privileges on table public.ai_agent_runs from anon, authenticated;
revoke all privileges on table public.notifications from anon, authenticated;

grant select, insert, update, delete on table public.ai_conversations to authenticated;
grant select, insert, update, delete on table public.ai_messages to authenticated;
grant select on table public.ai_agent_runs to authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;

-- 3. The vector corpus is shared internal knowledge, but only trusted backend jobs may mutate it.
alter table public.vector_documents enable row level security;
drop policy if exists vector_documents_all_authed on public.vector_documents;
drop policy if exists vector_documents_authenticated_read on public.vector_documents;
drop policy if exists vector_documents_service_role_all on public.vector_documents;

create policy vector_documents_authenticated_read
on public.vector_documents for select to authenticated
using (true);

create policy vector_documents_service_role_all
on public.vector_documents for all to service_role
using (true)
with check (true);

revoke all privileges on table public.vector_documents from anon, authenticated;
grant select on table public.vector_documents to authenticated;

-- Retire a stale role RPC that used the pre-GOD-MODE role vocabulary and was executable by anon.
revoke all on function public.set_user_role_by_email(text, text) from public, anon, authenticated;
drop function if exists public.set_user_role_by_email(text, text);

-- 4. Repair recoverable signal lineage and semantic classification.
update public.company_signals signal
set source_id = output.source_id,
    updated_at = now()
from public.monitoring_outputs output
where signal.monitoring_output_id = output.id
  and signal.source_id is null
  and output.source_id is not null;

update public.company_signals
set observed_vs_inferred = lower(metadata ->> 'observedVsInferred'),
    updated_at = now()
where lower(metadata ->> 'observedVsInferred') in ('observed', 'inferred', 'estimated', 'recommended')
  and observed_vs_inferred is distinct from lower(metadata ->> 'observedVsInferred');

update public.company_signals
set metadata = coalesce(metadata, '{}'::jsonb)
               || jsonb_build_object('observedVsInferred', observed_vs_inferred),
    updated_at = now()
where metadata ->> 'observedVsInferred' is distinct from observed_vs_inferred;

alter table public.company_signals
  drop constraint if exists company_signals_observed_vs_inferred_check;
alter table public.company_signals
  add constraint company_signals_observed_vs_inferred_check
  check (observed_vs_inferred in ('observed', 'inferred', 'estimated', 'recommended'));

create or replace function private.normalize_company_signal_lineage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  normalized_mode text;
begin
  normalized_mode := pg_catalog.lower(
    coalesce(
      nullif(new.metadata ->> 'observedVsInferred', ''),
      nullif(new.observed_vs_inferred, ''),
      'observed'
    )
  );

  if normalized_mode not in ('observed', 'inferred', 'estimated', 'recommended') then
    raise exception 'invalid_signal_observation_mode: %', normalized_mode using errcode = '23514';
  end if;

  new.observed_vs_inferred := normalized_mode;
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
                  || pg_catalog.jsonb_build_object('observedVsInferred', normalized_mode);

  if new.source_id is null and new.monitoring_output_id is not null then
    select output.source_id
    into new.source_id
    from public.monitoring_outputs output
    where output.id = new.monitoring_output_id;
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_company_signal_lineage() from public, anon, authenticated;

drop trigger if exists trg_normalize_company_signal_lineage on public.company_signals;
create trigger trg_normalize_company_signal_lineage
before insert or update of source_id, monitoring_output_id, observed_vs_inferred, metadata
on public.company_signals
for each row execute function private.normalize_company_signal_lineage();

create or replace view public.company_signal_lineage_quality_v1
with (security_invoker = true)
as
select
  signal.id,
  signal.company_id,
  signal.signal_type,
  signal.signal_label,
  signal.observed_at,
  signal.observed_vs_inferred,
  signal.source_id,
  signal.monitoring_output_id,
  signal.evidence_url,
  case
    when signal.source_id is not null then 'source_linked'
    when signal.monitoring_output_id is not null then 'monitoring_linked'
    when nullif(signal.evidence_url, '') is not null then 'evidence_url_only'
    when signal.observed_vs_inferred = 'inferred'
      and nullif(signal.metadata ->> 'corroboration', '') is not null
      then 'corroborated_inference'
    else 'missing_lineage'
  end as lineage_status,
  case
    when signal.metadata ->> 'observedVsInferred' = signal.observed_vs_inferred then 'aligned'
    else 'mismatch'
  end as semantic_status,
  signal.metadata,
  signal.created_at,
  signal.updated_at
from public.company_signals signal;

revoke all on table public.company_signal_lineage_quality_v1 from public, anon;
grant select on table public.company_signal_lineage_quality_v1 to authenticated, service_role;

create or replace view public.company_signal_quality_summary_v1
with (security_invoker = true)
as
select
  lineage_status,
  observed_vs_inferred,
  semantic_status,
  count(*)::bigint as signal_count,
  min(observed_at) as first_observed_at,
  max(observed_at) as last_observed_at
from public.company_signal_lineage_quality_v1
group by lineage_status, observed_vs_inferred, semantic_status;

revoke all on table public.company_signal_quality_summary_v1 from public, anon;
grant select on table public.company_signal_quality_summary_v1 to authenticated, service_role;

-- 5. Score history is multi-type by design; protect the real identity tuple from replay duplicates.
create unique index if not exists uq_score_snapshots_identity
on public.score_snapshots (
  company_id,
  created_at,
  score_type,
  (coalesce(nullif(score_version, ''), version::text, 'unversioned'))
);

comment on index public.uq_score_snapshots_identity is
  'Prevents duplicate replay for the same company, timestamp, score type and effective version.';

commit;
