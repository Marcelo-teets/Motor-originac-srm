begin;

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

with sole_god as (
  select profile.id
  from public.user_profiles profile
  where profile.role = 'god_mode'
    and profile.status = 'active'
    and (
      select count(*)
      from public.user_profiles candidate
      where candidate.role = 'god_mode' and candidate.status = 'active'
    ) = 1
)
update public.ai_conversations conversation
set owner_user_id = sole_god.id
from sole_god
where conversation.owner_user_id is null;

with sole_god as (
  select profile.id
  from public.user_profiles profile
  where profile.role = 'god_mode'
    and profile.status = 'active'
    and (
      select count(*)
      from public.user_profiles candidate
      where candidate.role = 'god_mode' and candidate.status = 'active'
    ) = 1
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

revoke all privileges on table public.ai_conversations from anon, authenticated;
revoke all privileges on table public.ai_messages from anon, authenticated;
revoke all privileges on table public.ai_agent_runs from anon, authenticated;
revoke all privileges on table public.notifications from anon, authenticated;

grant select, insert, update, delete on table public.ai_conversations to authenticated;
grant select, insert, update, delete on table public.ai_messages to authenticated;
grant select on table public.ai_agent_runs to authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;

commit;
