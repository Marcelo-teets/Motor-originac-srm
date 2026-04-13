-- ─────────────────────────────────────────────────────────────
-- Migration 014 — Runtime core RLS
-- Motor Originação SRM
-- Objetivo: isolar dados operacionais por usuário sem travar leitura de demo
-- ─────────────────────────────────────────────────────────────

-- WATCH LISTS
alter table if exists watchlists enable row level security;
alter table if exists watchlist_items enable row level security;

create policy if not exists "watchlists_select_own_or_shared"
  on watchlists for select
  using (created_by = auth.uid() or is_shared = true or created_by is null);

create policy if not exists "watchlists_insert_own"
  on watchlists for insert
  with check (created_by = auth.uid() or created_by is null);

create policy if not exists "watchlists_update_own"
  on watchlists for update
  using (created_by = auth.uid() or created_by is null)
  with check (created_by = auth.uid() or created_by is null);

create policy if not exists "watchlists_delete_own"
  on watchlists for delete
  using (created_by = auth.uid() or created_by is null);

create policy if not exists "watchlist_items_select_from_visible_lists"
  on watchlist_items for select
  using (
    exists (
      select 1
      from watchlists wl
      where wl.id = watchlist_items.watchlist_id
        and (wl.created_by = auth.uid() or wl.is_shared = true or wl.created_by is null)
    )
  );

create policy if not exists "watchlist_items_insert_into_owned_lists"
  on watchlist_items for insert
  with check (
    exists (
      select 1
      from watchlists wl
      where wl.id = watchlist_items.watchlist_id
        and (wl.created_by = auth.uid() or wl.created_by is null)
    )
  );

create policy if not exists "watchlist_items_delete_from_owned_lists"
  on watchlist_items for delete
  using (
    exists (
      select 1
      from watchlists wl
      where wl.id = watchlist_items.watchlist_id
        and (wl.created_by = auth.uid() or wl.created_by is null)
    )
  );

-- PIPELINE
alter table if exists pipeline enable row level security;
create policy if not exists "pipeline_select_authenticated"
  on pipeline for select
  using (auth.role() = 'authenticated');
create policy if not exists "pipeline_write_authenticated"
  on pipeline for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ACTIVITIES
alter table if exists activities enable row level security;
create policy if not exists "activities_select_authenticated"
  on activities for select
  using (auth.role() = 'authenticated');
create policy if not exists "activities_write_authenticated"
  on activities for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- TASKS
alter table if exists tasks enable row level security;
create policy if not exists "tasks_select_authenticated"
  on tasks for select
  using (auth.role() = 'authenticated');
create policy if not exists "tasks_write_authenticated"
  on tasks for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- COMPANY PATTERNS
alter table if exists company_patterns enable row level security;
create policy if not exists "company_patterns_select_authenticated"
  on company_patterns for select
  using (auth.role() = 'authenticated');
create policy if not exists "company_patterns_write_authenticated"
  on company_patterns for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
