-- Migration 017 — Operational runtime consolidation
-- Objetivo:
-- consolidar de forma idempotente as colunas e tabelas operacionais já usadas pelo runtime do MVP,
-- reduzindo risco de quebra em ambientes parcialmente migrados.

alter table if exists pipeline
  add column if not exists owner text,
  add column if not exists next_action text;

alter table if exists activities
  add column if not exists owner text,
  add column if not exists description text,
  add column if not exists type text,
  add column if not exists due_date timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists tasks
  add column if not exists owner text,
  add column if not exists description text,
  add column if not exists due_date timestamptz;

create table if not exists watchlists (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references users(id) on delete set null,
  name text not null,
  description text,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_watchlists_created_by
  on watchlists(created_by, created_at desc);

create table if not exists watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references watchlists(id) on delete cascade,
  company_id text not null references companies(id) on delete cascade,
  added_by uuid references users(id) on delete set null,
  priority_label text,
  notes text,
  added_at timestamptz not null default now(),
  constraint uq_watchlist_company unique(watchlist_id, company_id)
);

create index if not exists idx_watchlist_items_watchlist
  on watchlist_items(watchlist_id, added_at desc);

create index if not exists idx_watchlist_items_company
  on watchlist_items(company_id);

comment on table watchlists is
  'Listas de observação de empresas criadas por usuários para acompanhamento ativo antes do pipeline.';

comment on table watchlist_items is
  'Empresas vinculadas a uma watch list. Uma empresa pode estar em múltiplas listas.';
