-- 110_dcm_daily_outreach_rls_hardening.sql
-- Substitui políticas amplas por ownership explícito e acesso GOD-MODE.

alter table public.dcm_daily_leads
  alter column created_by set default auth.uid(),
  alter column updated_by set default auth.uid();

drop policy if exists dcm_daily_leads_authenticated_read on public.dcm_daily_leads;
drop policy if exists dcm_daily_leads_authenticated_write on public.dcm_daily_leads;

drop policy if exists dcm_daily_leads_select_owner_or_god on public.dcm_daily_leads;
drop policy if exists dcm_daily_leads_insert_owner_or_god on public.dcm_daily_leads;
drop policy if exists dcm_daily_leads_update_owner_or_god on public.dcm_daily_leads;
drop policy if exists dcm_daily_leads_delete_owner_or_god on public.dcm_daily_leads;

create policy dcm_daily_leads_select_owner_or_god
on public.dcm_daily_leads
for select
to authenticated
using (
  created_by = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy dcm_daily_leads_insert_owner_or_god
on public.dcm_daily_leads
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy dcm_daily_leads_update_owner_or_god
on public.dcm_daily_leads
for update
to authenticated
using (
  created_by = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
)
with check (
  created_by = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

create policy dcm_daily_leads_delete_owner_or_god
on public.dcm_daily_leads
for delete
to authenticated
using (
  created_by = (select auth.uid())
  or private.is_god_mode((select auth.uid()))
);

drop policy if exists dcm_outreach_feedback_authenticated_read on public.dcm_outreach_feedback;
drop policy if exists dcm_outreach_feedback_authenticated_write on public.dcm_outreach_feedback;

drop policy if exists dcm_outreach_feedback_select_owner_or_god on public.dcm_outreach_feedback;
drop policy if exists dcm_outreach_feedback_insert_owner_or_god on public.dcm_outreach_feedback;
drop policy if exists dcm_outreach_feedback_update_owner_or_god on public.dcm_outreach_feedback;
drop policy if exists dcm_outreach_feedback_delete_owner_or_god on public.dcm_outreach_feedback;

create policy dcm_outreach_feedback_select_owner_or_god
on public.dcm_outreach_feedback
for select
to authenticated
using (
  exists (
    select 1
    from public.dcm_daily_leads lead
    where lead.id = daily_lead_id
      and (
        lead.created_by = (select auth.uid())
        or private.is_god_mode((select auth.uid()))
      )
  )
);

create policy dcm_outreach_feedback_insert_owner_or_god
on public.dcm_outreach_feedback
for insert
to authenticated
with check (
  exists (
    select 1
    from public.dcm_daily_leads lead
    where lead.id = daily_lead_id
      and (
        lead.created_by = (select auth.uid())
        or private.is_god_mode((select auth.uid()))
      )
  )
);

create policy dcm_outreach_feedback_update_owner_or_god
on public.dcm_outreach_feedback
for update
to authenticated
using (
  exists (
    select 1
    from public.dcm_daily_leads lead
    where lead.id = daily_lead_id
      and (
        lead.created_by = (select auth.uid())
        or private.is_god_mode((select auth.uid()))
      )
  )
)
with check (
  exists (
    select 1
    from public.dcm_daily_leads lead
    where lead.id = daily_lead_id
      and (
        lead.created_by = (select auth.uid())
        or private.is_god_mode((select auth.uid()))
      )
  )
);

create policy dcm_outreach_feedback_delete_owner_or_god
on public.dcm_outreach_feedback
for delete
to authenticated
using (
  exists (
    select 1
    from public.dcm_daily_leads lead
    where lead.id = daily_lead_id
      and (
        lead.created_by = (select auth.uid())
        or private.is_god_mode((select auth.uid()))
      )
  )
);

revoke all on table public.dcm_daily_leads from public, anon;
revoke all on table public.dcm_outreach_feedback from public, anon;
revoke all on table public.dcm_daily_outreach_queue_v from public, anon;

grant select, insert, update, delete on table public.dcm_daily_leads to authenticated;
grant select, insert, update, delete on table public.dcm_outreach_feedback to authenticated;
grant select on table public.dcm_daily_outreach_queue_v to authenticated;

comment on column public.dcm_daily_leads.created_by is
  'Owner auth.uid(); GOD-MODE may operate all rows through RLS.';
