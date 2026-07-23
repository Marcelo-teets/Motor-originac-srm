-- Origination Knowledge Vault V3: saved operational views ("Bases")
-- Turns the existing knowledge_saved_views foundation into an authenticated,
-- reusable and auditable workspace for origination filters and ordering.

create index if not exists idx_knowledge_saved_views_owner_updated
  on public.knowledge_saved_views (created_by, updated_at desc);

create index if not exists idx_knowledge_saved_views_shared_updated
  on public.knowledge_saved_views (updated_at desc)
  where is_shared = true;

create or replace function public.knowledge_list_saved_views()
returns table (
  id uuid,
  name text,
  description text,
  view_type text,
  filters jsonb,
  sort_config jsonb,
  columns text[],
  is_shared boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  can_edit boolean
)
language sql
security invoker
set search_path = public
as $$
  select
    v.id,
    v.name,
    v.description,
    v.view_type,
    v.filters,
    v.sort_config,
    v.columns,
    v.is_shared,
    v.created_by,
    v.created_at,
    v.updated_at,
    v.created_by = (select auth.uid()) as can_edit
  from public.knowledge_saved_views v
  where v.is_shared
     or v.created_by = (select auth.uid())
  order by
    (v.created_by = (select auth.uid())) desc,
    v.updated_at desc,
    lower(v.name);
$$;

create or replace function public.knowledge_save_view(
  p_view_id uuid default null,
  p_name text default null,
  p_description text default '',
  p_view_type text default 'table',
  p_filters jsonb default '{}'::jsonb,
  p_sort_config jsonb default '{}'::jsonb,
  p_columns text[] default '{}'::text[],
  p_is_shared boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved_row public.knowledge_saved_views%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'View name is required';
  end if;

  if p_view_type not in ('table', 'cards', 'graph') then
    raise exception 'Invalid knowledge view type: %', p_view_type;
  end if;

  if p_view_id is null then
    insert into public.knowledge_saved_views (
      name,
      description,
      view_type,
      filters,
      sort_config,
      columns,
      is_shared,
      created_by
    ) values (
      btrim(p_name),
      coalesce(p_description, ''),
      p_view_type,
      coalesce(p_filters, '{}'::jsonb),
      coalesce(p_sort_config, '{}'::jsonb),
      coalesce(p_columns, '{}'::text[]),
      coalesce(p_is_shared, false),
      current_user_id
    )
    returning * into saved_row;
  else
    update public.knowledge_saved_views
    set
      name = btrim(p_name),
      description = coalesce(p_description, ''),
      view_type = p_view_type,
      filters = coalesce(p_filters, '{}'::jsonb),
      sort_config = coalesce(p_sort_config, '{}'::jsonb),
      columns = coalesce(p_columns, '{}'::text[]),
      is_shared = coalesce(p_is_shared, false)
    where id = p_view_id
      and created_by = current_user_id
    returning * into saved_row;

    if saved_row.id is null then
      raise exception 'Knowledge view not found or not editable: %', p_view_id;
    end if;
  end if;

  return jsonb_build_object(
    'id', saved_row.id,
    'name', saved_row.name,
    'description', saved_row.description,
    'viewType', saved_row.view_type,
    'filters', saved_row.filters,
    'sortConfig', saved_row.sort_config,
    'columns', to_jsonb(saved_row.columns),
    'isShared', saved_row.is_shared,
    'createdBy', saved_row.created_by,
    'createdAt', saved_row.created_at,
    'updatedAt', saved_row.updated_at,
    'canEdit', true
  );
end;
$$;

create or replace function public.knowledge_delete_view(p_view_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  affected integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.knowledge_saved_views
  where id = p_view_id
    and created_by = current_user_id;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

grant execute on function public.knowledge_list_saved_views() to authenticated, service_role;
grant execute on function public.knowledge_save_view(uuid, text, text, text, jsonb, jsonb, text[], boolean) to authenticated, service_role;
grant execute on function public.knowledge_delete_view(uuid) to authenticated, service_role;

revoke all on function public.knowledge_list_saved_views() from public, anon;
revoke all on function public.knowledge_save_view(uuid, text, text, text, jsonb, jsonb, text[], boolean) from public, anon;
revoke all on function public.knowledge_delete_view(uuid) from public, anon;
