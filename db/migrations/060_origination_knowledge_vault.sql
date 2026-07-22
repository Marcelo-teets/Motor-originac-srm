-- Origination Knowledge Vault v1
-- Internal, Obsidian-inspired knowledge graph for companies, signals, theses,
-- meetings, sources, structures and origination playbooks.

create table if not exists public.knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  slug text not null check (length(btrim(slug)) > 0),
  node_type text not null default 'note' check (node_type in (
    'note', 'company', 'thesis', 'signal', 'meeting', 'source', 'playbook', 'structure'
  )),
  content_markdown text not null default '',
  excerpt text not null default '',
  tags text[] not null default '{}'::text[],
  properties jsonb not null default '{}'::jsonb,
  company_id uuid references public.companies(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  visibility text not null default 'team' check (visibility in ('team', 'private')),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_knowledge_nodes_slug
  on public.knowledge_nodes (lower(slug));

create index if not exists idx_knowledge_nodes_company
  on public.knowledge_nodes (company_id, updated_at desc)
  where status = 'active';

create index if not exists idx_knowledge_nodes_type
  on public.knowledge_nodes (node_type, updated_at desc)
  where status = 'active';

create index if not exists idx_knowledge_nodes_tags
  on public.knowledge_nodes using gin (tags);

create index if not exists idx_knowledge_nodes_search
  on public.knowledge_nodes using gin (
    to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(content_markdown, ''))
  );

create table if not exists public.knowledge_links (
  id uuid primary key default gen_random_uuid(),
  source_node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  target_node_id uuid references public.knowledge_nodes(id) on delete set null,
  target_title text not null,
  target_slug text not null,
  relation_type text not null default 'wikilink' check (relation_type in (
    'wikilink', 'company', 'signal', 'thesis', 'evidence', 'supports', 'challenges', 'related'
  )),
  properties jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (source_node_id, target_slug, relation_type)
);

create index if not exists idx_knowledge_links_target
  on public.knowledge_links (target_node_id, created_at desc);

create index if not exists idx_knowledge_links_source
  on public.knowledge_links (source_node_id, created_at desc);

create table if not exists public.knowledge_node_versions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (node_id, version_number)
);

create index if not exists idx_knowledge_versions_node
  on public.knowledge_node_versions (node_id, version_number desc);

create table if not exists public.knowledge_saved_views (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  view_type text not null default 'table' check (view_type in ('table', 'cards', 'graph')),
  filters jsonb not null default '{}'::jsonb,
  sort_config jsonb not null default '{}'::jsonb,
  columns text[] not null default '{}'::text[],
  is_shared boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.knowledge_slugify(value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(value),
      'áàãâäéèêëíìîïóòõôöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

create or replace function public.touch_knowledge_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.version_knowledge_node()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_version integer;
begin
  select coalesce(max(version_number), 0) + 1
    into next_version
  from public.knowledge_node_versions
  where node_id = new.id;

  insert into public.knowledge_node_versions (
    node_id,
    version_number,
    snapshot,
    created_by
  ) values (
    new.id,
    next_version,
    jsonb_build_object(
      'title', new.title,
      'slug', new.slug,
      'nodeType', new.node_type,
      'contentMarkdown', new.content_markdown,
      'excerpt', new.excerpt,
      'tags', to_jsonb(new.tags),
      'properties', new.properties,
      'companyId', new.company_id,
      'status', new.status,
      'visibility', new.visibility,
      'updatedAt', new.updated_at
    ),
    new.updated_by
  );

  return new;
end;
$$;

create or replace function public.refresh_knowledge_links(p_node_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_row public.knowledge_nodes%rowtype;
  link_title text;
  link_slug text;
  resolved_id uuid;
  inserted_count integer := 0;
begin
  select * into source_row
  from public.knowledge_nodes
  where id = p_node_id;

  if not found then
    raise exception 'Knowledge node not found: %', p_node_id;
  end if;

  delete from public.knowledge_links
  where source_node_id = p_node_id
    and relation_type = 'wikilink';

  for link_title in
    select distinct btrim((matches)[1])
    from regexp_matches(
      source_row.content_markdown,
      '\[\[([^\]|]+)(?:\|[^\]]+)?\]\]',
      'g'
    ) as matches
    where length(btrim((matches)[1])) > 0
  loop
    link_slug := public.knowledge_slugify(link_title);

    select id into resolved_id
    from public.knowledge_nodes
    where lower(slug) = lower(link_slug)
      and status = 'active'
    limit 1;

    insert into public.knowledge_links (
      source_node_id,
      target_node_id,
      target_title,
      target_slug,
      relation_type,
      created_by
    ) values (
      p_node_id,
      resolved_id,
      link_title,
      link_slug,
      'wikilink',
      source_row.updated_by
    )
    on conflict (source_node_id, target_slug, relation_type)
    do update set
      target_node_id = excluded.target_node_id,
      target_title = excluded.target_title;

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.knowledge_list_nodes(
  p_query text default null,
  p_node_type text default null,
  p_company_id uuid default null,
  p_tag text default null
)
returns table (
  id uuid,
  title text,
  slug text,
  node_type text,
  excerpt text,
  tags text[],
  properties jsonb,
  company_id uuid,
  company_name text,
  visibility text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  backlink_count bigint,
  outbound_count bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    n.id,
    n.title,
    n.slug,
    n.node_type,
    n.excerpt,
    n.tags,
    n.properties,
    n.company_id,
    coalesce(c.trade_name, c.legal_name) as company_name,
    n.visibility,
    n.created_by,
    n.updated_by,
    n.created_at,
    n.updated_at,
    (select count(*) from public.knowledge_links incoming where incoming.target_node_id = n.id) as backlink_count,
    (select count(*) from public.knowledge_links outgoing where outgoing.source_node_id = n.id) as outbound_count
  from public.knowledge_nodes n
  left join public.companies c on c.id = n.company_id
  where n.status = 'active'
    and (p_node_type is null or n.node_type = p_node_type)
    and (p_company_id is null or n.company_id = p_company_id)
    and (p_tag is null or p_tag = any(n.tags))
    and (
      p_query is null
      or length(btrim(p_query)) = 0
      or to_tsvector('portuguese', coalesce(n.title, '') || ' ' || coalesce(n.content_markdown, ''))
        @@ websearch_to_tsquery('portuguese', p_query)
      or n.title ilike '%' || p_query || '%'
      or n.content_markdown ilike '%' || p_query || '%'
    )
  order by n.updated_at desc
  limit 300;
$$;

create or replace function public.knowledge_get_node(p_node_id uuid)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'node', (to_jsonb(n) - 'status'),
    'companyName', coalesce(c.trade_name, c.legal_name),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'targetNodeId', l.target_node_id,
        'targetTitle', l.target_title,
        'targetSlug', l.target_slug,
        'relationType', l.relation_type,
        'resolvedTitle', target.title
      ) order by l.created_at)
      from public.knowledge_links l
      left join public.knowledge_nodes target on target.id = l.target_node_id
      where l.source_node_id = n.id
    ), '[]'::jsonb),
    'backlinks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'sourceNodeId', l.source_node_id,
        'sourceTitle', source.title,
        'sourceSlug', source.slug,
        'relationType', l.relation_type
      ) order by l.created_at desc)
      from public.knowledge_links l
      join public.knowledge_nodes source on source.id = l.source_node_id
      where l.target_node_id = n.id
    ), '[]'::jsonb),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'versionNumber', v.version_number,
        'createdBy', v.created_by,
        'createdAt', v.created_at
      ) order by v.version_number desc)
      from (
        select *
        from public.knowledge_node_versions
        where node_id = n.id
        order by version_number desc
        limit 20
      ) v
    ), '[]'::jsonb)
  )
  from public.knowledge_nodes n
  left join public.companies c on c.id = n.company_id
  where n.id = p_node_id
    and n.status = 'active';
$$;

create or replace function public.knowledge_save_node(
  p_node_id uuid default null,
  p_title text default null,
  p_node_type text default 'note',
  p_content_markdown text default '',
  p_tags text[] default '{}'::text[],
  p_properties jsonb default '{}'::jsonb,
  p_company_id uuid default null,
  p_visibility text default 'team'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved_id uuid;
  candidate_slug text;
  suffix integer := 1;
  clean_content text := coalesce(p_content_markdown, '');
  clean_excerpt text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'Title is required';
  end if;

  if p_node_type not in ('note', 'company', 'thesis', 'signal', 'meeting', 'source', 'playbook', 'structure') then
    raise exception 'Invalid node type: %', p_node_type;
  end if;

  if p_visibility not in ('team', 'private') then
    raise exception 'Invalid visibility: %', p_visibility;
  end if;

  clean_excerpt := left(regexp_replace(clean_content, '\s+', ' ', 'g'), 240);

  if p_node_id is null then
    candidate_slug := public.knowledge_slugify(p_title);
    if length(candidate_slug) = 0 then
      candidate_slug := 'nota';
    end if;

    while exists (select 1 from public.knowledge_nodes where lower(slug) = lower(candidate_slug)) loop
      suffix := suffix + 1;
      candidate_slug := public.knowledge_slugify(p_title) || '-' || suffix::text;
    end loop;

    insert into public.knowledge_nodes (
      title,
      slug,
      node_type,
      content_markdown,
      excerpt,
      tags,
      properties,
      company_id,
      visibility,
      created_by,
      updated_by
    ) values (
      btrim(p_title),
      candidate_slug,
      p_node_type,
      clean_content,
      clean_excerpt,
      coalesce(p_tags, '{}'::text[]),
      coalesce(p_properties, '{}'::jsonb),
      p_company_id,
      p_visibility,
      current_user_id,
      current_user_id
    )
    returning id into saved_id;
  else
    update public.knowledge_nodes
    set
      title = btrim(p_title),
      node_type = p_node_type,
      content_markdown = clean_content,
      excerpt = clean_excerpt,
      tags = coalesce(p_tags, '{}'::text[]),
      properties = coalesce(p_properties, '{}'::jsonb),
      company_id = p_company_id,
      visibility = p_visibility,
      updated_by = current_user_id
    where id = p_node_id
      and status = 'active'
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Knowledge node not found or not editable: %', p_node_id;
    end if;
  end if;

  perform public.refresh_knowledge_links(saved_id);
  return public.knowledge_get_node(saved_id);
end;
$$;

create or replace function public.knowledge_archive_node(p_node_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  update public.knowledge_nodes
  set status = 'archived', updated_by = auth.uid()
  where id = p_node_id
    and status = 'active';

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.knowledge_graph_snapshot(
  p_company_id uuid default null,
  p_limit integer default 160
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  with visible_nodes as (
    select n.*
    from public.knowledge_nodes n
    where n.status = 'active'
      and (p_company_id is null or n.company_id = p_company_id)
    order by n.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 160), 300))
  ),
  visible_links as (
    select l.*
    from public.knowledge_links l
    join visible_nodes source on source.id = l.source_node_id
    where l.target_node_id is null
       or exists (select 1 from visible_nodes target where target.id = l.target_node_id)
  ),
  linked_companies as (
    select distinct c.id, coalesce(c.trade_name, c.legal_name) as name
    from visible_nodes n
    join public.companies c on c.id = n.company_id
  )
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'title', n.title,
        'slug', n.slug,
        'nodeType', n.node_type,
        'companyId', n.company_id,
        'tags', to_jsonb(n.tags),
        'updatedAt', n.updated_at
      ) order by n.updated_at desc)
      from visible_nodes n
    ), '[]'::jsonb),
    'companyNodes', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name))
      from linked_companies c
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'source', l.source_node_id,
        'target', l.target_node_id,
        'targetTitle', l.target_title,
        'relationType', l.relation_type
      ))
      from visible_links l
    ), '[]'::jsonb),
    'companyEdges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', 'company:' || n.id::text,
        'source', n.id,
        'target', 'company:' || n.company_id::text,
        'relationType', 'company'
      ))
      from visible_nodes n
      where n.company_id is not null
    ), '[]'::jsonb)
  );
$$;

alter table public.knowledge_nodes enable row level security;
alter table public.knowledge_links enable row level security;
alter table public.knowledge_node_versions enable row level security;
alter table public.knowledge_saved_views enable row level security;

-- Team notes are shared among authenticated internal users. Private notes remain
-- visible and editable only to their creator.
drop policy if exists knowledge_nodes_select on public.knowledge_nodes;
create policy knowledge_nodes_select
  on public.knowledge_nodes
  for select
  to authenticated
  using (visibility = 'team' or created_by = (select auth.uid()));

drop policy if exists knowledge_nodes_insert on public.knowledge_nodes;
create policy knowledge_nodes_insert
  on public.knowledge_nodes
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and updated_by = (select auth.uid())
  );

drop policy if exists knowledge_nodes_update on public.knowledge_nodes;
create policy knowledge_nodes_update
  on public.knowledge_nodes
  for update
  to authenticated
  using (visibility = 'team' or created_by = (select auth.uid()))
  with check (
    (visibility = 'team' or created_by = (select auth.uid()))
    and updated_by = (select auth.uid())
  );

drop policy if exists knowledge_nodes_delete on public.knowledge_nodes;
create policy knowledge_nodes_delete
  on public.knowledge_nodes
  for delete
  to authenticated
  using (visibility = 'team' or created_by = (select auth.uid()));

drop policy if exists knowledge_links_select on public.knowledge_links;
create policy knowledge_links_select
  on public.knowledge_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.knowledge_nodes n
      where n.id = source_node_id
        and (n.visibility = 'team' or n.created_by = (select auth.uid()))
    )
  );

drop policy if exists knowledge_links_insert on public.knowledge_links;
create policy knowledge_links_insert
  on public.knowledge_links
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.knowledge_nodes n
      where n.id = source_node_id
        and (n.visibility = 'team' or n.created_by = (select auth.uid()))
    )
  );

drop policy if exists knowledge_links_delete on public.knowledge_links;
create policy knowledge_links_delete
  on public.knowledge_links
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.knowledge_nodes n
      where n.id = source_node_id
        and (n.visibility = 'team' or n.created_by = (select auth.uid()))
    )
  );

drop policy if exists knowledge_versions_select on public.knowledge_node_versions;
create policy knowledge_versions_select
  on public.knowledge_node_versions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.knowledge_nodes n
      where n.id = node_id
        and (n.visibility = 'team' or n.created_by = (select auth.uid()))
    )
  );

drop policy if exists knowledge_versions_insert on public.knowledge_node_versions;
create policy knowledge_versions_insert
  on public.knowledge_node_versions
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.knowledge_nodes n
      where n.id = node_id
        and (n.visibility = 'team' or n.created_by = (select auth.uid()))
    )
  );

drop policy if exists knowledge_views_select on public.knowledge_saved_views;
create policy knowledge_views_select
  on public.knowledge_saved_views
  for select
  to authenticated
  using (is_shared or created_by = (select auth.uid()));

drop policy if exists knowledge_views_insert on public.knowledge_saved_views;
create policy knowledge_views_insert
  on public.knowledge_saved_views
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists knowledge_views_update on public.knowledge_saved_views;
create policy knowledge_views_update
  on public.knowledge_saved_views
  for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists knowledge_views_delete on public.knowledge_saved_views;
create policy knowledge_views_delete
  on public.knowledge_saved_views
  for delete
  to authenticated
  using (created_by = (select auth.uid()));

drop trigger if exists trg_touch_knowledge_nodes on public.knowledge_nodes;
create trigger trg_touch_knowledge_nodes
  before update on public.knowledge_nodes
  for each row execute function public.touch_knowledge_updated_at();

drop trigger if exists trg_version_knowledge_nodes on public.knowledge_nodes;
create trigger trg_version_knowledge_nodes
  after insert or update on public.knowledge_nodes
  for each row execute function public.version_knowledge_node();

drop trigger if exists trg_touch_knowledge_views on public.knowledge_saved_views;
create trigger trg_touch_knowledge_views
  before update on public.knowledge_saved_views
  for each row execute function public.touch_knowledge_updated_at();

grant select, insert, update, delete on public.knowledge_nodes to authenticated;
grant select, insert, update, delete on public.knowledge_links to authenticated;
grant select, insert on public.knowledge_node_versions to authenticated;
grant select, insert, update, delete on public.knowledge_saved_views to authenticated;

grant all on public.knowledge_nodes to service_role;
grant all on public.knowledge_links to service_role;
grant all on public.knowledge_node_versions to service_role;
grant all on public.knowledge_saved_views to service_role;

grant execute on function public.knowledge_slugify(text) to authenticated, service_role;
grant execute on function public.refresh_knowledge_links(uuid) to authenticated, service_role;
grant execute on function public.knowledge_list_nodes(text, text, uuid, text) to authenticated, service_role;
grant execute on function public.knowledge_get_node(uuid) to authenticated, service_role;
grant execute on function public.knowledge_save_node(uuid, text, text, text, text[], jsonb, uuid, text) to authenticated, service_role;
grant execute on function public.knowledge_archive_node(uuid) to authenticated, service_role;
grant execute on function public.knowledge_graph_snapshot(uuid, integer) to authenticated, service_role;

revoke all on function public.knowledge_slugify(text) from anon;
revoke all on function public.refresh_knowledge_links(uuid) from anon;
revoke all on function public.knowledge_list_nodes(text, text, uuid, text) from anon;
revoke all on function public.knowledge_get_node(uuid) from anon;
revoke all on function public.knowledge_save_node(uuid, text, text, text, text[], jsonb, uuid, text) from anon;
revoke all on function public.knowledge_archive_node(uuid) from anon;
revoke all on function public.knowledge_graph_snapshot(uuid, integer) from anon;